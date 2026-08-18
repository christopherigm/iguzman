"""The two front-panel buttons: power, and next scene.

Both are momentary switches to GND on an internal pull-up, so a press reads
as a falling edge and nothing external is needed to make that work.

**Presses are caught by a pin interrupt, not by sampling.** Everything else
in this firmware blocks: a single buzzer pulse holds the CPU for up to
230 ms, and a quick tap that started and ended inside one would simply not
exist to a loop that reads the pin when it gets a moment. The handler does
the debounce and sets a flag - nothing else. It must not touch the buzzer or
the LEDs, both of which sleep, and sleeping inside an interrupt is how you
get a lantern that stops responding to anything.

Acting on the flag happens in `Controls.poll()`, which `scenes.Stage.idle`
calls - and that runs in every gap the buzzer leaves as well as continuously
in the ambient loop, so an action lands within a few milliseconds of the
press no matter what the firmware was in the middle of.

The power button is a three-position cycle rather than a toggle, because one
button has to carry three jobs and the lantern has no display to explain
which one you are about to get:

    press 1   on, with sound   flood 100% + white
    press 2   mute             flood 100% + red
    press 3   go to sleep      flood 100% + purple, held 2 s, then dark
    press 4   on, with sound   ... and round

Every leg is unconditional: press 2 always silences and never unsilences,
and the wake leg is what brings the sound back. The mute state therefore
does *not* survive an off-and-on any more, which is the deliberate opposite
of what this file used to do - it is what makes the cycle mean the same
thing on every lap instead of depending on where the last one stopped.

`config.BOOT_POWERED` decides whether the lantern is already burning when the
pack goes in. It does not change the cycle: press 1 is the wake leg either
way, which on a lantern that booted lit is a white flash confirming what you
can already see. That is deliberate - see `__init__` for why the first press
must not be the mute leg.

The other button is the track button: one press plays the next file in
`AUDIO_DIR`, and a press during one skips to the file after it. Nothing else
starts a track, so the folder is only ever walked in order, by hand.
"""

from machine import Pin
from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

import config

# Where a press lands us, in order. The cycle is positional, not derived from
# the current state: "on, mute, off" is what the hand learns, and inferring
# the next action from whether sound happens to be muted would make the same
# press do different things on different nights.
_PHASE_OFF = 0
_PHASE_ON = 1
_PHASE_SOUND = 2
_PHASES = 3


class Button:
    """One debounced momentary switch, latched on the falling edge."""

    def __init__(self, pin, debounce_ms=None):
        self._debounce = (
            config.BUTTON_DEBOUNCE_MS if debounce_ms is None else debounce_ms
        )
        # One debounce window in the past, not "now": seeding this with the
        # current time would make the button ignore a press landing in the
        # first BUTTON_DEBOUNCE_MS after boot.
        self._last = ticks_add(ticks_ms(), -self._debounce)
        self._latched = False
        self._pin = Pin(pin, Pin.IN, Pin.PULL_UP)
        self._pin.irq(trigger=Pin.IRQ_FALLING, handler=self._edge)

    def _edge(self, _pin):
        # Interrupt context: no allocation, no sleeping, no I/O.
        now = ticks_ms()
        if ticks_diff(now, self._last) < self._debounce:
            return  # contact bounce, not a second press
        self._last = now
        self._latched = True

    def pressed(self):
        """True once per press, then False again until the next one."""
        latched = self._latched
        self._latched = False
        return latched


class Controls:
    """Both buttons, and what each of them does.

    They are read here rather than inside the modules they affect, so the
    whole path from "a button went down" to "the lantern went dark" is one
    short file rather than a flag threaded through three. That is also why
    this holds the lamps and the flood: the confirmation flash belongs to the
    button, not to the show, and no scene should have to know about it.
    """

    def __init__(
        self,
        bz,
        lamps=(),
        flood=None,
        speaker=None,
        power_pin=None,
        scene_pin=None,
        powered=None,
    ):
        self._bz = bz
        self._lamps = lamps
        self._flood = flood
        self._speaker = speaker
        self._power = Button(config.POWER_PIN if power_pin is None else power_pin)
        self._scene = Button(config.SCENE_PIN if scene_pin is None else scene_pin)
        self._scene_pending = False
        powered = config.BOOT_POWERED if powered is None else powered
        self._powered = bool(powered)
        # The phase stays at OFF even when we boot lit, and that is not an
        # inconsistency: it records what the last *press* did, and nobody has
        # pressed. So the first press is always the wake leg, which on an
        # already-lit lantern is a white flash and nothing else.
        #
        # Starting at _PHASE_ON instead - which is the obvious reading of
        # "boots powered" and was the first attempt - makes the first press
        # the *sound* leg. Somebody who plugs the pack in and presses the
        # power button once to check the thing is alive would silence it, get
        # a red light for their trouble, and then need three more presses to
        # get the sound back. The cycle the hand learns is worth more than
        # the internal tidiness.
        self._phase = _PHASE_OFF

    def poll(self):
        """Serve whatever the interrupts latched. Safe to call constantly."""
        if self._power.pressed():
            self._advance()
        if self._scene.pressed():
            self._scene_pending = True

    # -- the power button ------------------------------------------------

    def _advance(self):
        self._phase = (self._phase + 1) % _PHASES
        if self._phase == _PHASE_ON:
            self._powered = True
            # Waking always comes back audible, so the cycle is positional in
            # the *sound* as well as in the lighting: press 1 is on, press 2
            # is mute, press 3 is off, every time round. It used to be a
            # toggle, which meant the second press silenced or unsilenced
            # depending on what the previous cycle happened to leave behind -
            # one button with three legs and only two of them predictable.
            self._set_muted(False)
            self._confirm(config.POWER_ON_RGB, config.CONFIRM_MS)
        elif self._phase == _PHASE_SOUND:
            # Always mute, never unmute: coming back from silence is the wake
            # leg's job now. Red, because this press only ever means silent.
            self._set_muted(True)
            self._confirm(config.SOUND_OFF_RGB, config.CONFIRM_MS)
        else:
            self._powered = False
            self._confirm(config.POWER_OFF_RGB, config.POWER_OFF_CONFIRM_MS)
            self._blackout()

    def _set_muted(self, muted):
        """Silence or unsilence both sound devices together.

        The Buzzer owns the flag for both, including on a build with no
        buzzer soldered to that pin - see `_carrier` in `buzzer.py`. One
        flag, so this button cannot leave the lantern half silent.

        Nothing blips here. `toggle_mute()` did, as proof the sound path
        still worked, but that made sense when unmuting was a press somebody
        chose; now it is a side effect of waking up and a chirp on every
        power-on is a tic, not a confirmation. The white flash says it.
        """
        self._bz.mute(muted)
        if self._speaker is not None:
            self._speaker.mute(muted)

    def powered(self):
        """False while the lantern is asleep. `main.run` parks on this."""
        return self._powered

    def set_power(self, on=True):
        """Force the power leg without a press - for the REPL, where there is
        nobody to hold the button down and every scene would otherwise abort
        instantly against `Stage.interrupted()`.

        Mute is left exactly as it is, unlike the real wake leg: at a REPL
        `set_power(True)` is scaffolding for whatever you are about to test,
        and having it undo a `mute()` you typed two lines earlier would be a
        surprise in the one place surprises are expensive.
        """
        self._phase = _PHASE_ON if on else _PHASE_OFF
        self._powered = bool(on)
        if not self._powered:
            self._blackout()

    def _confirm(self, rgb, ms):
        """Hold one colour over the whole lantern, then return.

        Blocking, and deliberately with `sleep_ms` rather than the buzzer's
        `rest()`: rest() calls the idle callback, the idle callback calls
        `poll()`, and poll() is what is running right now - a press landing
        inside the confirmation would re-enter this and stack a second hold
        on top of the first. Nothing else needs the CPU here anyway; the
        flame is repainted by whoever owns the idle slot as soon as we leave.
        """
        if self._flood is not None:
            self._flood.set(config.CONFIRM_FLOOD)
        for lamp in self._lamps:
            lamp.set(*rgb)
        sleep_ms(ms)

    def _blackout(self):
        """Everything off, now.

        The interrupted scene will unwind through its own `release()` a
        moment later, but that runs at the buzzer's convenience and the
        purple has already said the lantern is going out - it should not
        still be glowing while a caw finishes.
        """
        for lamp in self._lamps:
            lamp.off()
        if self._flood is not None:
            self._flood.off()
        self._bz.off()
        if self._speaker is not None:
            # The amplifier especially: a track left running into a lantern
            # that has just gone dark is the one thing someone reaching for
            # that button is definitely trying to stop, and it is also the
            # part drawing 300 mA while it does it.
            self._speaker.off()

    # -- the scene button ------------------------------------------------

    def scene_requested(self):
        """True while a press is still waiting to be served.

        The buzzer's blocking primitives check this and bail out early, which
        is what lets a press cut a scene short instead of queueing behind it.
        """
        return self._scene_pending

    def take_scene_request(self):
        """Consume a pending press. True if there was one."""
        pending = self._scene_pending
        self._scene_pending = False
        return pending
