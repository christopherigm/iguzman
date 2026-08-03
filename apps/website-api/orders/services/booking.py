"""Turning a branch's opening hours into the slots a customer may actually book.

This module is the single place that decides whether a given moment is bookable,
and it is deliberately the *only* one: the availability endpoint the calendar
paints from and the checkout that writes the booking both call `slots_for_day`,
so the times a customer is shown and the times the server will accept cannot
drift apart. A second, "quick" overlap check written inline in a view is how a
customer ends up staring at a slot that refuses itself on submit.

Four rules compose, in this order:

1. **The branch's weekday hours** (`BranchHours`), read as local wall clock in
   the branch's own timezone - a day with no row is closed.
2. **The lunch break**, subtracted from that window.
3. **The minimum notice**, which trims the near edge of today (and possibly all
   of today).
4. **Capacity**, which counts active bookings overlapping each candidate slot.

Everything here works in the branch's local timezone and converts to UTC only at
the boundary, because that is the direction that survives daylight saving: "we
open at 9" is a wall-clock fact, and deriving it from a stored offset breaks
twice a year.
"""

from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.db.models import Count, Q
from django.utils import timezone as dj_timezone

from core.models import Branch

from ..models import Booking

# A guard on the slot loop rather than a business rule: a branch open 24h on a
# one-minute grid would otherwise generate 1440 candidates and one capacity
# query each. No sane configuration comes near it.
MAX_SLOTS_PER_DAY = 200

# The floor for `Branch.booking_slot_minutes`. A zero would divide by nothing and
# spin forever; anything under 5 is a configuration mistake, not a preference.
MIN_SLOT_MINUTES = 5


def branches_for(service):
    """The branches a service may be booked at, in display order.

    An empty `booking_branches` means "every branch" rather than "no branch" -
    an unconfigured bookable service must still be bookable, and a tenant that
    never opened the picker means it does not care which location.

    A tenant with **no** Branch rows at all gets an empty list, which is the
    home-business case the feature has to support: the booking is then written
    with `branch=None` and follows `DEFAULT_*` scheduling. That is why callers
    must handle an empty result rather than treating it as an error.
    """
    if service is None:
        return []
    chosen = list(service.booking_branches.filter(enabled=True))
    if chosen:
        return chosen
    return list(Branch.objects.filter(system_id=service.system_id, enabled=True))


def resolve_branch(service, branch_id):
    """Pick the branch a booking request means, or explain why it cannot.

    Returns ``(branch, error)`` where exactly one is set - except for the
    single-location business, which legitimately resolves to ``(None, None)``.

    A branch id is never trusted as given: it must be one of the branches *this*
    service offers, or a customer could book a location the tenant never opened
    to it (and, across tenants, one it does not own at all).
    """
    available = branches_for(service)
    if not available:
        # No locations configured: the tenant works out of one implicit place.
        return None, None
    if branch_id is None:
        if len(available) == 1:
            return available[0], None
        return None, "A location is required for this service."
    for branch in available:
        if branch.pk == branch_id:
            return branch, None
    return None, "That location is not available for this service."


def _windows_for_weekday(branch, weekday):
    """The open intervals for one weekday, as ``(start_time, end_time)`` pairs.

    One interval normally, two when a lunch break splits the day, none when the
    branch is closed. A break that does not actually fall inside the open window
    is ignored rather than treated as an error - `BranchHours.clean` rejects one
    at write time, and an availability lookup is not the place to raise over a
    row that predates the validation.
    """
    if branch is None:
        return [(time(9, 0), time(17, 0))]

    hours = next((h for h in branch.hours.all() if h.weekday == weekday), None)
    if hours is None:
        return []

    opens, closes = hours.opens_at, hours.closes_at
    if opens >= closes:
        return []

    start, end = hours.break_start, hours.break_end
    if not start or not end or start >= end or start <= opens or end >= closes:
        return [(opens, closes)]
    return [(opens, start), (end, closes)]


def _branch_settings(branch):
    """Scheduling knobs with the single-location fallbacks applied.

    A tenant with no Branch rows still needs a grid, a notice period and a
    horizon; these are the same defaults the Branch fields declare, so a business
    that later creates its first branch sees no change in behaviour.
    """
    if branch is None:
        return {
            "slot_minutes": 30,
            "capacity": 1,
            "min_notice_hours": 2,
            "max_days_ahead": 60,
            "tzinfo": dj_timezone.get_default_timezone(),
        }
    return {
        "slot_minutes": max(branch.booking_slot_minutes or 30, MIN_SLOT_MINUTES),
        "capacity": max(branch.booking_capacity or 1, 1),
        "min_notice_hours": branch.booking_min_notice_hours or 0,
        "max_days_ahead": branch.booking_max_days_ahead or 60,
        "tzinfo": branch.tzinfo,
    }


def service_duration_minutes(service):
    """How long one appointment blocks the calendar for.

    `Service.duration` is optional in the catalog (plenty of services are sold
    without one), so a bookable service with no duration falls back to an hour
    rather than to zero - a zero-length booking would occupy no time and let a
    branch take unlimited overlapping appointments.
    """
    duration = getattr(service, "duration", None) or 0
    return duration if duration > 0 else 60


def booking_window(branch, *, now=None):
    """``(first_bookable_instant, last_bookable_date)`` for a branch, in UTC/local.

    The first instant is the minimum notice applied to *now*; the last date is
    the horizon, expressed as a local date because that is what the calendar
    paints.
    """
    settings = _branch_settings(branch)
    now = now or dj_timezone.now()
    earliest = now + timedelta(hours=settings["min_notice_hours"])
    last_date = (now.astimezone(settings["tzinfo"]) + timedelta(days=settings["max_days_ahead"])).date()
    return earliest, last_date


def _occupancy(branch, day_start_utc, day_end_utc, *, exclude_booking_id=None):
    """Active bookings for one branch overlapping one day, as (start, end) pairs.

    Fetched once per day rather than queried per slot: a day on a 15-minute grid
    is ~40 candidate slots, and asking the database 40 times for rows it already
    returned in one pass is the difference between a calendar that paints and one
    that crawls.

    Scoped by branch, including the `branch=None` case - a single-location
    business's bookings all carry a null branch, and they must still contend with
    each other for the one slot.
    """
    qs = Booking.objects.filter(
        status__in=Booking.ACTIVE_STATUSES,
        starts_at__lt=day_end_utc,
        ends_at__gt=day_start_utc,
    )
    qs = qs.filter(branch=branch) if branch is not None else qs.filter(branch__isnull=True)
    if exclude_booking_id is not None:
        qs = qs.exclude(pk=exclude_booking_id)
    return list(qs.values_list("starts_at", "ends_at"))


def slots_for_day(service, branch, day, *, now=None, exclude_booking_id=None, occupied=None):
    """Every bookable start time on one local date, as timezone-aware UTC datetimes.

    `day` is a `datetime.date` read in the **branch's** timezone, which is what
    the customer's calendar is showing - not the server's date and not the
    browser's.

    A slot is offered when the whole appointment (start + the service's duration)
    fits inside an open window, starts no earlier than the minimum notice allows,
    and leaves the branch's capacity unexceeded for its entire length.

    `occupied` lets a caller that already fetched a wider range of bookings pass
    them in instead of paying for a query per day - `availability_range` does
    exactly that for the calendar, which would otherwise cost sixty round trips
    to paint two months. Left `None`, this fetches the one day it needs.
    """
    settings = _branch_settings(branch)
    tzinfo = settings["tzinfo"]
    duration = timedelta(minutes=service_duration_minutes(service))
    step = timedelta(minutes=settings["slot_minutes"])
    capacity = settings["capacity"]

    now = now or dj_timezone.now()
    earliest, last_date = booking_window(branch, now=now)
    if day > last_date or day < now.astimezone(tzinfo).date():
        return []

    windows = _windows_for_weekday(branch, day.weekday())
    if not windows:
        return []

    if occupied is None:
        # One day of local wall clock, widened by the duration so an appointment
        # that starts before midnight and runs past it is still counted against
        # the slots it overlaps.
        day_start_utc = datetime.combine(day, time.min, tzinfo=tzinfo).astimezone(dt_timezone.utc)
        day_end_utc = (
            datetime.combine(day, time.min, tzinfo=tzinfo) + timedelta(days=1)
        ).astimezone(dt_timezone.utc)
        occupied = _occupancy(
            branch,
            day_start_utc - duration,
            day_end_utc + duration,
            exclude_booking_id=exclude_booking_id,
        )

    slots = []
    for window_start, window_end in windows:
        cursor = datetime.combine(day, window_start, tzinfo=tzinfo)
        window_close = datetime.combine(day, window_end, tzinfo=tzinfo)
        guard = 0
        while cursor + duration <= window_close and guard < MAX_SLOTS_PER_DAY:
            guard += 1
            start_utc = cursor.astimezone(dt_timezone.utc)
            end_utc = start_utc + duration
            cursor += step
            if start_utc < earliest:
                continue
            overlapping = sum(
                1 for busy_start, busy_end in occupied if busy_start < end_utc and busy_end > start_utc
            )
            if overlapping >= capacity:
                continue
            slots.append(start_utc)

    return sorted(slots)


def is_slot_available(service, branch, start_utc, *, now=None, exclude_booking_id=None):
    """Whether `start_utc` is a slot this service can still be booked into.

    Checkout's last word before it writes the booking, and the reason the answer
    is recomputed rather than taken from the request: the calendar the customer
    is looking at may be minutes old, and in a busy shop the last slot goes in
    that gap. It re-derives the day's slots through exactly the same function the
    calendar was painted from, so "available" means one thing in this codebase.
    """
    settings = _branch_settings(branch)
    local_day = start_utc.astimezone(settings["tzinfo"]).date()
    slots = slots_for_day(
        service, branch, local_day, now=now, exclude_booking_id=exclude_booking_id,
    )
    return start_utc in slots


def availability_range(service, branch, start_date, days, *, now=None):
    """``{date: [start_utc, …]}`` for a run of consecutive local dates.

    What the booking calendar is painted from: it needs both which days are
    selectable and which times each offers, and computing them separately would
    mean two passes that could disagree - a date shown as open whose slot list
    then comes back empty.

    **The occupancy query happens once for the whole range**, not once per day.
    Sixty days of `slots_for_day` would otherwise be sixty round trips on a
    public, unauthenticated endpoint, which is a denial-of-service handed out for
    free.
    """
    settings = _branch_settings(branch)
    tzinfo = settings["tzinfo"]
    duration = timedelta(minutes=service_duration_minutes(service))
    now = now or dj_timezone.now()

    end_date = start_date + timedelta(days=days)
    range_start_utc = datetime.combine(start_date, time.min, tzinfo=tzinfo).astimezone(dt_timezone.utc)
    range_end_utc = datetime.combine(end_date, time.min, tzinfo=tzinfo).astimezone(dt_timezone.utc)
    occupied = _occupancy(branch, range_start_utc - duration, range_end_utc + duration)

    result = {}
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        slots = slots_for_day(service, branch, day, now=now, occupied=occupied)
        if slots:
            result[day] = slots
    return result


def capacity_snapshot(branch, day_start_utc, day_end_utc):
    """Reporting helper: active booking count for a branch over a range.

    Not part of the booking flow - the CMS list shows how full a day is, and one
    aggregate beats walking the slot generator for a screen that only needs a
    number.
    """
    return (
        Booking.objects.filter(
            Q(starts_at__lt=day_end_utc) & Q(ends_at__gt=day_start_utc),
            status__in=Booking.ACTIVE_STATUSES,
            branch=branch,
        )
        .values("branch")
        .annotate(count=Count("id"))
    )
