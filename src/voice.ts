// Spoken callouts when the player lands a hit.
//
// These are pre-rendered audio files (see scripts/render-voice.sh), not live
// SpeechSynthesis. That choice is what makes everything below possible:
//
//   1. SpeechSynthesis output cannot be routed into an AudioContext, so it can
//      never be processed. Decoded audio can.
//   2. SpeechSynthesis picks whatever voice the operating system happens to
//      ship, so no two players hear the same reading. Files are identical
//      everywhere.
//
// The source is still a synthetic voice, and on its own it sounds like one. It
// is run through a shipboard-intercom chain to disguise that: band-limiting to
// roughly the range a comms speaker reproduces throws away the frequencies
// where synthesis artifacts are most audible, and saturation plus a little room
// gives the signal a physical character it otherwise lacks. The goal is not to
// pass the voice off as a person in a studio, but to make it read as a person
// heard over the boat's speakers, which is both more achievable and closer to
// the intended reference.
import { getAudioContext, resumeAudio, createNoiseBuffer } from './audio';
import callouts from './assets/voice/callouts.json';

// Vite fingerprints and bundles these; the eager glob keeps the file list in
// one place so adding a line means re-running the render script and nothing
// else. Sorted because glob key order is not guaranteed to be numeric.
const AUDIO_URLS: string[] = Object.entries(
  import.meta.glob<string>('./assets/voice/hit-*.m4a', {
    eager: true,
    query: '?url',
    import: 'default',
  })
)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url);

export const HIT_CALLOUTS: readonly string[] = callouts.hit;

// --- Intercom voicing -------------------------------------------------------
// A comms speaker reproduces roughly 250Hz-3.4kHz. Cutting outside that is the
// single biggest contributor to believability here.
const BAND_LOW_HZ = 260;
const BAND_HIGH_HZ = 3400;
// Lift around the consonant range so the line stays intelligible once the
// extremes are gone.
const PRESENCE_HZ = 1900;
const PRESENCE_GAIN_DB = 5;
// Slight slowdown drops the pitch and adds weight. Below about 0.9 the formants
// smear and it starts to sound like a monster rather than a man.
const PLAYBACK_RATE = 0.94;
// Drive into the waveshaper. Enough to add grit, not enough to sound broken.
const SATURATION = 12;
const OUTPUT_GAIN = 1.0;
// Speaker hiss under the line. Barely audible alone; its absence is noticeable.
const HISS_GAIN = 0.012;

/**
 * Odd-symmetric soft clipper. Adds mostly odd harmonics, which reads as the
 * grit of an overdriven speaker rather than as digital distortion.
 */
const makeSaturationCurve = (amount: number): Float32Array<ArrayBuffer> => {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
};

/** Short, bright decay: a small compartment of steel rather than a hall. */
const makeRoomImpulse = (ctx: AudioContext): AudioBuffer => {
  const seconds = 0.22;
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // Exponential decay over white noise is a cheap, convincing small room.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  return impulse;
};

/**
 * Pick the next callout, never repeating the previous one. Pure so the rotation
 * can be tested without an audio engine.
 */
export const pickCallout = (
  lines: readonly string[],
  lastIndex: number,
  random: () => number = Math.random
): { line: string; index: number } => {
  if (lines.length === 0) throw new Error('No callouts to choose from');
  if (lines.length === 1) return { line: lines[0], index: 0 };

  // Choose from the other lines, then map back, so every pick is uniform over
  // the remaining options rather than being a retry loop.
  const candidates = lines.length - 1;
  let index = Math.floor(random() * candidates);
  if (lastIndex >= 0 && index >= lastIndex) index += 1;
  index = Math.min(index, lines.length - 1);

  return { line: lines[index], index };
};

type DuckFn = (active: boolean) => void;

class VoiceManager {
  private enabled = true;
  private lastIndex = -1;
  private buffers: (AudioBuffer | null)[] = [];
  private loading: Promise<void> | null = null;
  private duck: DuckFn | null = null;
  private current: AudioBufferSourceNode | null = null;
  private curve = makeSaturationCurve(SATURATION);
  private impulse: AudioBuffer | null = null;

  isSupported() {
    return AUDIO_URLS.length > 0;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  /** Let the music duck itself while a line is playing. */
  onSpeaking(duck: DuckFn) {
    this.duck = duck;
  }

  /**
   * Fetch and decode every line. Safe to call repeatedly; the work happens
   * once. Called on entering combat so the first hit does not wait on a fetch.
   *
   * A failed decode leaves that slot null rather than rejecting, so one bad
   * asset cannot take out the whole feature.
   */
  preload(): Promise<void> {
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const ctx = getAudioContext();
      this.buffers = await Promise.all(
        AUDIO_URLS.map(async url => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            return await ctx.decodeAudioData(await res.arrayBuffer());
          } catch {
            return null;
          }
        })
      );
    })();

    return this.loading;
  }

  cancel() {
    if (this.current) {
      // onended fires on stop() and handles un-ducking.
      try {
        this.current.stop();
      } catch {
        // Already finished; nothing to stop.
      }
      this.current = null;
    }
    this.duck?.(false);
  }

  /**
   * Choose the next callout and play it.
   *
   * Returns the chosen line whenever callouts are enabled, even if the audio
   * has not finished loading or failed to decode, so the caller can always
   * render it as a subtitle.
   */
  speakHitCallout(): string | null {
    if (!this.enabled) return null;

    const { line, index } = pickCallout(HIT_CALLOUTS, this.lastIndex);
    this.lastIndex = index;

    const buffer = this.buffers[index];
    if (!buffer) {
      // Not loaded yet, or this asset failed. Kick off loading for next time
      // and let the subtitle carry the line.
      void this.preload();
      return line;
    }

    // Hits can land faster than a line takes to read. Cut the one in progress
    // rather than letting callouts pile up and run behind the game.
    this.cancel();
    this.play(buffer);
    return line;
  }

  /** Build the intercom chain and run one line through it. */
  private play(buffer: AudioBuffer) {
    resumeAudio();
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = buffer.duration / PLAYBACK_RATE;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = PLAYBACK_RATE;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = BAND_LOW_HZ;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = BAND_HIGH_HZ;

    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = PRESENCE_HZ;
    presence.Q.value = 1.1;
    presence.gain.value = PRESENCE_GAIN_DB;

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.curve;
    shaper.oversample = '4x';

    // Comms limiting: hard, fast, and obvious. Real intercoms squash badly.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.knee.value = 6;
    comp.ratio.value = 10;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;

    const out = ctx.createGain();
    out.gain.value = OUTPUT_GAIN;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(presence);
    presence.connect(shaper);
    shaper.connect(comp);
    comp.connect(out);

    // A touch of the compartment around the voice, mixed well under the dry
    // signal so intelligibility is untouched.
    if (!this.impulse) this.impulse = makeRoomImpulse(ctx);
    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    comp.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);

    out.connect(ctx.destination);

    // Speaker hiss for the length of the line, faded at both ends so it does
    // not click. Its absence is more noticeable than its presence.
    const hiss = ctx.createBufferSource();
    hiss.buffer = createNoiseBuffer(Math.max(duration, 0.2));
    const hissBand = ctx.createBiquadFilter();
    hissBand.type = 'bandpass';
    hissBand.frequency.value = 1800;
    hissBand.Q.value = 0.7;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.0001, now);
    hissGain.gain.linearRampToValueAtTime(HISS_GAIN, now + 0.05);
    hissGain.gain.setValueAtTime(HISS_GAIN, now + duration - 0.08);
    hissGain.gain.linearRampToValueAtTime(0.0001, now + duration);
    hiss.connect(hissBand);
    hissBand.connect(hissGain);
    hissGain.connect(ctx.destination);
    hiss.start(now);
    hiss.stop(now + duration + 0.05);

    this.duck?.(true);
    source.onended = () => {
      // Only release the duck if nothing newer has taken over.
      if (this.current === source) {
        this.current = null;
        this.duck?.(false);
      }
    };

    this.current = source;
    source.start(now);
  }

  /** Clears rotation memory so a new game does not resume mid-cycle. */
  reset() {
    this.lastIndex = -1;
    this.cancel();
  }
}

export const voiceManager = new VoiceManager();