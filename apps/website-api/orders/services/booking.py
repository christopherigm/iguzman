"""Turning a branch's opening hours into the slots a customer may actually book.

This module is the single place that decides whether a given moment is bookable,
and it is deliberately the *only* one: the availability endpoint the calendar
paints from and the checkout that writes the booking both call `slots_for_day`,
so the times a customer is shown and the times the server will accept cannot
drift apart. A second, "quick" overlap check written inline in a view is how a
customer ends up staring at a slot that refuses itself on submit.

Four rules compose, in this order:

1. **The branch's weekday hours** (`BranchHours`), read as local wall clock in
   the branch's own timezone - a day with no row is closed. Start times are
   spaced by the **service's own duration** unless the branch overrides the grid;
   see `slot_step_minutes`.
2. **The lunch break**, subtracted from that window.
3. **The minimum notice**, which trims the near edge of today (and possibly all
   of today).
4. **Capacity**, which is counted in **seats on a resource**: every active
   booking overlapping a candidate slot consumes `party_size` seats of the
   resource it was assigned to, and the slot is offered when some single
   resource still has room for the whole party.

Everything here works in the branch's local timezone and converts to UTC only at
the boundary, because that is the direction that survives daylight saving: "we
open at 9" is a wall-clock fact, and deriving it from a stored offset breaks
twice a year.

**The invariant that keeps resources safe to add:** a branch with no
`ResourcePool` rows resolves to *one implicit resource* carrying
`Branch.booking_capacity`, so a tenant that never opens the pools editor gets
byte-for-byte the behaviour it had before pools existed (at party size 1, summing
seats reproduces the old "count the overlapping bookings" test exactly). Every
piece of complexity below is opt-in; see `resources_for`.
"""

from collections import namedtuple
from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.db.models import Q, Sum
from django.utils import timezone as dj_timezone

from core.models import Branch

from ..models import Booking

# One offered start time, and how big a party could still take it.
#
# `seats_left` is the largest free block on **one** resource, never the sum
# across them: the question a customer is asking of a slot is "can the six of us
# get on the 10:00?", and two boats with three seats each answer no.
Slot = namedtuple("Slot", ["at", "seats_left"])

# The outcome of trying to place a party at a moment.
#
# ⚠ Two fields rather than an optional resource, because `resource=None` is
# genuinely ambiguous here: it is both "the implicit fallback resource" (the
# tenant has no pools, and there is nothing to point at) and "nothing fits". A
# bare optional would make every caller's `if resource:` silently wrong for the
# tenant that never configured anything - which is most of them.
Assignment = namedtuple("Assignment", ["fits", "resource"])

# The stand-in for a branch that has defined no pools: one resource, holding
# `Branch.booking_capacity` people, with no identity to record on a booking.
# `pk = None` is what makes it line up with `Booking.resource_id` being null.
_ImplicitResource = namedtuple("_ImplicitResource", ["pk", "capacity"])

# A guard on the slot loop rather than a business rule: a branch open 24h on a
# one-minute grid would otherwise generate 1440 candidates and one capacity
# query each. No sane configuration comes near it.
MAX_SLOTS_PER_DAY = 200

# The floor for the slot grid, whichever side it comes from. A zero would divide
# by nothing and spin forever; anything under 5 is a configuration mistake, not a
# preference.
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


def pools_for(service, branch):
    """The resource pools a service draws on at one branch, in display order.

    Empty `booking_pools` means **every** enabled pool at the branch, the same
    "empty is everything" rule `branches_for` follows and for the same reason: a
    tenant that enabled party bookings without opening the pool picker meant "use
    what I have", not "use nothing".

    The branch filter is what makes `booking_pools` compose with
    `booking_branches` instead of fighting it - a pool belonging to a location
    this service is not offered at is simply never reachable, whether or not the
    picker names it.
    """
    if branch is None or service is None:
        # No branch means no pools by construction: a pool hangs off a branch,
        # and the branchless home business has nowhere to hang one.
        return []
    chosen = [p for p in service.booking_pools.filter(enabled=True) if p.branch_id == branch.pk]
    if chosen:
        return chosen
    return list(branch.resource_pools.filter(enabled=True))


def resources_for(service, branch):
    """Every bookable resource for this service at this branch, capacity included.

    **This is the fallback that keeps the whole feature opt-in.** With no pools
    configured it returns a single `_ImplicitResource` carrying the branch's own
    `booking_capacity` (or the branchless default), which reproduces exactly what
    the engine did before resources existed. Do not "clean this up" into a data
    migration that gives every branch a real pool - the implicit case has to keep
    working for a branch created tomorrow as well as for the ones that exist now.
    """
    resources = []
    for pool in pools_for(service, branch):
        resources.extend(pool.resources.filter(enabled=True))
    if resources:
        return resources
    return [_ImplicitResource(pk=None, capacity=_branch_settings(branch)["capacity"])]


def free_by_resource(resources, occupied, start_utc, end_utc):
    """``{resource_pk: seats still free}`` for one candidate appointment window.

    Seats, not bookings: each overlapping booking subtracts its own `party_size`.
    At party size 1 this is arithmetically identical to the old
    "count the overlapping rows" test, which is what makes the migration a no-op
    in behaviour as well as in schema.

    ⚠ **A booking with no resource is charged to every resource.** Rows written
    before pools existed - or while the branch had none - carry `resource_id`
    null, and there is no way to know which boat they are really on. Counting
    them against only the (now absent) implicit resource would drop them from the
    arithmetic entirely and oversell every real one, so they are treated as
    occupying whichever resource we are about to hand out. That is conservative
    rather than exact: it can refuse a booking that would in fact have fitted,
    and it self-heals as those appointments age out of the active statuses.
    """
    used = {}
    unassigned = 0
    for busy_start, busy_end, resource_id, party in occupied:
        if not (busy_start < end_utc and busy_end > start_utc):
            continue
        seats = party or 1
        if resource_id is None:
            unassigned += seats
        else:
            used[resource_id] = used.get(resource_id, 0) + seats

    # `unassigned` is added to every resource: for the implicit one it *is* its
    # own occupancy (its bookings carry a null resource by definition), and for a
    # real one it is the conservative charge described above.
    return {r.pk: r.capacity - used.get(r.pk, 0) - unassigned for r in resources}


def assign_resource(resources, occupied, start_utc, end_utc, party_size, *, preferred_id=None):
    """Which resource this party goes on, or `Assignment(fits=False, ...)`.

    **Best fit**: of the resources that can still take the whole party, the one
    with the *least* room left. That consolidates - two half-full boats become
    one - and so preserves the large free blocks that large parties need. First
    fit does the precise opposite, scattering small parties across every resource
    until nothing can seat a family. It is a one-line choice with a real
    operational consequence, which is why it is spelled out here.

    `preferred_id` is honoured whenever it still fits, so a customer's pick and a
    staff reassignment both survive a re-check; it falls through to best fit
    rather than failing, because "your guide is now full" is a worse answer than
    quietly seating them with another one.
    """
    free = free_by_resource(resources, occupied, start_utc, end_utc)
    by_pk = {r.pk: r for r in resources}

    if preferred_id is not None and free.get(preferred_id, -1) >= party_size:
        return _assigned(by_pk[preferred_id])

    best = None
    for resource in resources:
        room = free.get(resource.pk, 0)
        if room < party_size:
            continue
        # Tie-broken on pk so two equally tight resources always resolve the same
        # way; an unstable choice here would make the availability payload and
        # the checkout that re-derives it disagree about which boat is free.
        key = (room, resource.pk or 0)
        if best is None or key < best[0]:
            best = (key, resource)

    if best is None:
        return Assignment(fits=False, resource=None)
    return _assigned(best[1])


def _assigned(resource):
    """Wrap a chosen resource, normalising the implicit one back to `None`.

    A booking on the implicit resource records no `resource` FK - there is no row
    to point at - so the caller writes null, exactly as it did before pools.
    """
    return Assignment(fits=True, resource=None if resource.pk is None else resource)


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

    A tenant with no Branch rows still needs a notice period and a horizon; these
    are the same defaults the Branch fields declare, so a business that later
    creates its first branch sees no change in behaviour.

    `capacity` here is in **seats**, and is only ever read as the capacity of the
    implicit resource `resources_for` falls back to.

    `slot_minutes` is the odd one out: it is the branch's *override* of the
    grid, so `None` (no override, follow the service's duration) is the ordinary
    answer rather than a missing one - read it through `slot_step_minutes`, never
    directly.
    """
    if branch is None:
        return {
            "slot_minutes": None,
            "capacity": 1,
            "min_notice_hours": 2,
            "max_days_ahead": 60,
            "tzinfo": dj_timezone.get_default_timezone(),
        }
    return {
        # `None` rather than a number is the ordinary case: it means the branch
        # has not overridden the grid, and `slot_step_minutes` reads the
        # service's duration instead.
        "slot_minutes": (
            max(branch.booking_slot_minutes, MIN_SLOT_MINUTES)
            if branch.booking_slot_minutes
            else None
        ),
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


def slot_step_minutes(service, branch):
    """How far apart the offered start times are.

    **The service's own duration by default**, so a two-hour tour is offered at
    9:00 and 11:00 rather than every half hour: with one boat, the 9:30 that a
    finer grid printed beside them was never bookable once the 9:00 was taken,
    and a screen full of buttons that delete each other is not a schedule.

    `Branch.booking_slot_minutes` overrides it for the location that genuinely
    starts appointments closer together than one of them lasts - a three-chair
    salon beginning a 90-minute colour every 30 minutes, where capacity rather
    than the clock is the limit. Empty (the default) is "follow the duration",
    which is why the override is read as a truthy value and not with `or`.
    """
    override = _branch_settings(branch)["slot_minutes"]
    if override:
        return override
    return max(service_duration_minutes(service), MIN_SLOT_MINUTES)


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
    """Active bookings for one branch overlapping one day.

    Rows are ``(start, end, resource_id, party_size)`` - everything the seat
    arithmetic in `free_by_resource` needs, and nothing it does not.

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
    return list(qs.values_list("starts_at", "ends_at", "resource_id", "party_size"))


def day_availability(
    service,
    branch,
    day,
    *,
    party_size=1,
    resource_id=None,
    now=None,
    exclude_booking_id=None,
    occupied=None,
    resources=None,
):
    """Every bookable start time on one local date, as `Slot(at, seats_left)`.

    `day` is a `datetime.date` read in the **branch's** timezone, which is what
    the customer's calendar is showing - not the server's date and not the
    browser's.

    A slot is offered when the whole appointment (start + the service's duration)
    fits inside an open window, starts no earlier than the minimum notice allows,
    and **some single resource** still has `party_size` seats free for its entire
    length. `resource_id` narrows that to one specific resource, which is what a
    customer picking "Montse" or a staff reassignment is asking about.

    `occupied` and `resources` let a caller that already fetched them pass them in
    instead of paying per day - `availability_range` does exactly that for the
    calendar, which would otherwise cost sixty occupancy round trips (and sixty
    more for the pools) to paint two months. Left `None`, this fetches what it
    needs for the one day.
    """
    settings = _branch_settings(branch)
    tzinfo = settings["tzinfo"]
    duration = timedelta(minutes=service_duration_minutes(service))
    step = timedelta(minutes=slot_step_minutes(service, branch))
    party_size = max(int(party_size or 1), 1)

    now = now or dj_timezone.now()
    earliest, last_date = booking_window(branch, now=now)
    if day > last_date or day < now.astimezone(tzinfo).date():
        return []

    windows = _windows_for_weekday(branch, day.weekday())
    if not windows:
        return []

    if resources is None:
        resources = resources_for(service, branch)
    if resource_id is not None:
        resources = [r for r in resources if r.pk == resource_id]
        if not resources:
            # A resource that is not this service's to offer has no availability,
            # rather than falling back to "any" - which would hand a customer a
            # slot on a boat they did not ask for and were not shown.
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
            free = free_by_resource(resources, occupied, start_utc, end_utc)
            largest = max(free.values(), default=0)
            if largest < party_size:
                continue
            slots.append(Slot(at=start_utc, seats_left=largest))

    return sorted(slots)


def slots_for_day(service, branch, day, **kwargs):
    """`day_availability` reduced to bare start instants.

    Kept as its own name because it is the shape most callers (and every test of
    "which times does this day offer") actually want; the seat counts only matter
    to the payload the booking page paints.
    """
    return [slot.at for slot in day_availability(service, branch, day, **kwargs)]


def assign_for_slot(
    service,
    branch,
    start_utc,
    *,
    party_size=1,
    preferred_id=None,
    now=None,
    exclude_booking_id=None,
):
    """Place a party at one instant: `Assignment(fits, resource)`.

    Checkout's last word before it writes the booking, and the reason the answer
    is recomputed rather than taken from the request: the calendar the customer
    is looking at may be minutes old, and in a busy shop the last seats go in that
    gap. It re-derives the day through exactly the same rules the calendar was
    painted from, so "available" means one thing in this codebase - and it hands
    back *which* resource in the same pass, so the decision and the write cannot
    disagree about it.
    """
    settings = _branch_settings(branch)
    tzinfo = settings["tzinfo"]
    duration = timedelta(minutes=service_duration_minutes(service))
    party_size = max(int(party_size or 1), 1)
    local_day = start_utc.astimezone(tzinfo).date()

    # Fetched once and shared with the day walk below. This runs inside
    # checkout's row lock, so a second identical query would be a second
    # round-trip held under it for nothing.
    day_start_utc = datetime.combine(local_day, time.min, tzinfo=tzinfo).astimezone(dt_timezone.utc)
    day_end_utc = day_start_utc + timedelta(days=1)
    occupied = _occupancy(
        branch,
        day_start_utc - duration,
        day_end_utc + duration,
        exclude_booking_id=exclude_booking_id,
    )
    resources = resources_for(service, branch)

    # The slot has to be one the day actually offers - open hours, no lunch, past
    # the minimum notice - before asking which resource it lands on. Deliberately
    # *not* narrowed to `preferred_id`: a customer's pick that has since filled up
    # should fall through to best fit below, not refuse the booking outright.
    offered = day_availability(
        service,
        branch,
        local_day,
        party_size=party_size,
        now=now,
        occupied=occupied,
        resources=resources,
    )
    if not any(slot.at == start_utc for slot in offered):
        return Assignment(fits=False, resource=None)

    return assign_resource(
        resources,
        occupied,
        start_utc,
        start_utc + duration,
        party_size,
        preferred_id=preferred_id,
    )


def is_slot_available(
    service, branch, start_utc, *, party_size=1, resource_id=None, now=None, exclude_booking_id=None,
):
    """Whether `start_utc` can still take a party of `party_size`.

    The boolean face of `assign_for_slot`, kept because plenty of callers only
    need the yes/no - and because a predicate reads better in a test than
    unpacking an assignment does.
    """
    return assign_for_slot(
        service,
        branch,
        start_utc,
        party_size=party_size,
        preferred_id=resource_id,
        now=now,
        exclude_booking_id=exclude_booking_id,
    ).fits


def availability_range(service, branch, start_date, days, *, party_size=1, resource_id=None, now=None):
    """``{date: [Slot, …]}`` for a run of consecutive local dates.

    What the booking calendar is painted from: it needs both which days are
    selectable and which times each offers, and computing them separately would
    mean two passes that could disagree - a date shown as open whose slot list
    then comes back empty.

    **The occupancy query happens once for the whole range**, not once per day,
    and so does the pool/resource lookup. Sixty days of `day_availability` would
    otherwise be sixty round trips on a public, unauthenticated endpoint, which is
    a denial-of-service handed out for free.
    """
    settings = _branch_settings(branch)
    tzinfo = settings["tzinfo"]
    duration = timedelta(minutes=service_duration_minutes(service))
    now = now or dj_timezone.now()

    end_date = start_date + timedelta(days=days)
    range_start_utc = datetime.combine(start_date, time.min, tzinfo=tzinfo).astimezone(dt_timezone.utc)
    range_end_utc = datetime.combine(end_date, time.min, tzinfo=tzinfo).astimezone(dt_timezone.utc)
    occupied = _occupancy(branch, range_start_utc - duration, range_end_utc + duration)
    resources = resources_for(service, branch)

    result = {}
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        slots = day_availability(
            service,
            branch,
            day,
            party_size=party_size,
            resource_id=resource_id,
            now=now,
            occupied=occupied,
            resources=resources,
        )
        if slots:
            result[day] = slots
    return result


def party_capacity_ceiling(service):
    """The largest party any single resource could hold, across every branch.

    ⚠ **An upper bound, not a promise.** Branches differ - a service offered at a
    ten-seat boat and a two-seat one reports 10 - and it ignores who is already
    booked. The service detail page uses it as a static ceiling on its counter so
    a customer is not offered a party the tenant could never seat; the booking
    page does the real filtering, per branch and per slot, from the availability
    payload.

    ⚠ **Never call this from a list serializer.** It walks pools and resources
    per service, which is an N+1 across a catalog grid; the card only needs the
    `booking_party_enabled` boolean.
    """
    branches = branches_for(service) or [None]
    return max(
        (r.capacity for branch in branches for r in resources_for(service, branch)),
        default=1,
    )


def selectable_resources(service, branch):
    """The resources a *customer* may pick between, as ``(resource, pool)`` pairs.

    Only pools flagged `customer_selectable` appear: a salon assigns whichever
    chair is free and the customer never hears about it, so publishing every
    internal label would leak the tenant's own naming for no benefit. An empty
    list is the normal case and means the booking page shows no picker at all.
    """
    pairs = []
    for pool in pools_for(service, branch):
        if not pool.customer_selectable:
            continue
        for resource in pool.resources.filter(enabled=True):
            pairs.append((resource, pool))
    return pairs


def capacity_snapshot(branch, day_start_utc, day_end_utc):
    """Reporting helper: seats booked at a branch over a range.

    Not part of the booking flow - the CMS list shows how full a day is, and one
    aggregate beats walking the slot generator for a screen that only needs a
    number.

    ⚠ Sums `party_size` rather than counting rows, for the same reason the engine
    does: capacity is measured in seats, and counting rows would report a boat
    carrying two families of four as "2 of 10 taken".
    """
    return (
        Booking.objects.filter(
            Q(starts_at__lt=day_end_utc) & Q(ends_at__gt=day_start_utc),
            status__in=Booking.ACTIVE_STATUSES,
            branch=branch,
        )
        .values("branch")
        .annotate(seats=Sum("party_size"))
    )
