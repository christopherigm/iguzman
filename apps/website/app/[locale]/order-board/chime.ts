/**
 * The board's arrival alert: two short notes, synthesised with the Web Audio
 * API rather than shipped as an audio file.
 *
 * No asset means nothing to load before the first order lands (a mounted tablet
 * may sit idle for an hour between them), nothing to cache, and no format
 * question - and the sound is three lines of arithmetic.
 *
 * ⚠ **An AudioContext created before a user gesture starts `suspended`**, and
 * every browser keeps it that way until one arrives, so a chime scheduled on a
 * poll would play into silence. `unlockAudio` is called from the board shell's
 * capture-phase click handler - the operator's first tap anywhere - and the
 * context is only *created* there, never on module load.
 */

let ctx: AudioContext | null = null;

/**
 * The constructor, under either name, or null where there is no Web Audio.
 *
 * Read off `window` through a cast because neither name is declared *on* the
 * `Window` interface - `AudioContext` is a global `var`, and the prefixed one
 * (still the only spelling on older iOS Safari) is not in the DOM lib at all.
 */
function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Create (or wake) the audio context. Safe to call on every gesture - the
 * context is made once and `resume()` on a running one is a no-op.
 */
export function unlockAudio(): void {
  const Ctor = audioCtor();
  if (Ctor === null) return;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
}

/**
 * Two rising notes, ~0.4s in total. Does nothing at all when the context was
 * never unlocked or Web Audio is unavailable: a board with no sound is still a
 * working board, and a thrown error mid-poll would take the refresh with it.
 */
export function playChime(): void {
  unlockAudio();
  const audio = ctx;
  if (audio === null || audio.state !== "running") return;

  const start = audio.currentTime;
  // A5 then D6 - a rising pair reads as "something arrived" where a single beep
  // reads as a button press.
  [880, 1174.66].forEach((frequency, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;

    // Ramped rather than switched on and off: a gain that jumps from 0 is a
    // click, which over a kitchen's ambient noise is the part that carries.
    const at = start + i * 0.18;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  });
}
