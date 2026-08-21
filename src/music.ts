// Procedural score in the spirit of a Cold War submarine picture: a slow minor
// hymn carried by a male-choir pad over low brass, with timpani on the downbeats.
// Entirely synthesized — nothing copyrighted is shipped or streamed.
//
// Everything is scheduled ahead of time against the AudioContext clock rather
// than driven by setInterval directly. A timer only decides *when to schedule*;
// the audio clock decides when notes sound, so playback does not drift or
// stutter when the main thread is busy re-rendering the board.
import { getAudioContext, resumeAudio, createNoiseBuffer, noteToFreq } from './audio';

const BPM = 54; // funereal, hymn-like
const BEAT = 60 / BPM;
export const BEATS_PER_BAR = 4;

// Look-ahead scheduling constants (the standard Web Audio pattern).
const SCHEDULE_INTERVAL_MS = 120;
const SCHEDULE_AHEAD_S = 0.7;

const FADE_IN_S = 3.0;
const FADE_OUT_S = 1.6;
const MUSIC_LEVEL = 0.32;

// How far the score drops under a spoken callout, and how quickly. A choir pad
// sitting at full level makes synthesized speech very hard to make out.
const DUCK_LEVEL = 0.09;
const DUCK_S = 0.18;
const UNDUCK_S = 0.5;

export interface Bar {
  /** Bass/organ pedal note. */
  bass: string;
  /** Choir triad, voiced low so it reads as men's voices. */
  choir: string[];
  /** Timpani hits, as beat offsets within the bar. */
  drum: number[];
}

// i - VI - III - VII in D aeolian. The flat-VI and flat-VII give it the modal,
// vaguely Slavic colour the brief asks for; a raised leading tone would make it
// sound Western and wrong.
export const BARS: Bar[] = [
  { bass: 'D2', choir: ['D3', 'F3', 'A3'], drum: [0] },          // Dm
  { bass: 'D2', choir: ['D3', 'F3', 'A3'], drum: [0, 2.5] },     // Dm
  { bass: 'Bb1', choir: ['D3', 'F3', 'Bb3'], drum: [0] },        // Bb
  { bass: 'Bb1', choir: ['D3', 'F3', 'Bb3'], drum: [0, 3] },     // Bb
  { bass: 'F2', choir: ['C3', 'F3', 'A3'], drum: [0] },          // F
  { bass: 'F2', choir: ['C3', 'F3', 'A3'], drum: [0, 2.5] },     // F
  { bass: 'C2', choir: ['C3', 'E3', 'G3'], drum: [0] },          // C
  { bass: 'C2', choir: ['C3', 'E3', 'G3'], drum: [0, 2, 3] },    // C -> turnaround
];

export interface MelodyNote {
  /** Absolute beat from the top of the loop. */
  at: number;
  note: string;
  beats: number;
}

// A stepwise brass line that enters on the third bar, so the loop opens with
// atmosphere and only later states a tune.
export const MELODY: MelodyNote[] = [
  { at: 8, note: 'A3', beats: 2 },
  { at: 10, note: 'Bb3', beats: 1 },
  { at: 11, note: 'C4', beats: 1 },
  { at: 12, note: 'D4', beats: 3 },
  { at: 15, note: 'C4', beats: 1 },
  { at: 16, note: 'A3', beats: 2 },
  { at: 18, note: 'F3', beats: 2 },
  { at: 20, note: 'G3', beats: 2 },
  { at: 22, note: 'A3', beats: 2 },
  { at: 24, note: 'E3', beats: 2 },
  { at: 26, note: 'G3', beats: 2 },
  { at: 28, note: 'F3', beats: 4 },
];

export const LOOP_BEATS = BARS.length * BEATS_PER_BAR;

class MusicEngine {
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextBeat = 0;
  private nextBeatTime = 0;
  private playing = false;

  private getMaster(): GainNode {
    const ctx = getAudioContext();
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
    }
    return this.master;
  }

  isPlaying() {
    return this.playing;
  }

  /**
   * Pull the score down under spoken dialogue and let it back up afterwards.
   * A no-op while stopped, so an in-flight callout cannot resurrect the music
   * by un-ducking it after the player has muted or the game has ended.
   */
  duck(active: boolean) {
    if (!this.playing) return;
    const ctx = getAudioContext();
    const gain = this.getMaster().gain;
    const target = active ? DUCK_LEVEL : MUSIC_LEVEL;
    const seconds = active ? DUCK_S : UNDUCK_S;

    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(gain.value, ctx.currentTime);
    gain.linearRampToValueAtTime(target, ctx.currentTime + seconds);
  }

  start() {
    if (this.playing) return;
    resumeAudio();
    const ctx = getAudioContext();
    const master = this.getMaster();

    this.playing = true;
    this.nextBeat = 0;
    this.nextBeatTime = ctx.currentTime + 0.15;

    // Swell in rather than snapping on.
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + FADE_IN_S);

    this.scheduleWindow();
    this.timer = window.setInterval(() => this.scheduleWindow(), SCHEDULE_INTERVAL_MS);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;

    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }

    // Notes already scheduled will still fire, so fade the bus instead of
    // trying to hunt down and kill individual oscillators.
    const ctx = getAudioContext();
    const master = this.getMaster();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_OUT_S);
  }

  /** Schedule every beat that falls inside the look-ahead window. */
  private scheduleWindow() {
    const ctx = getAudioContext();
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleBeat(this.nextBeat, this.nextBeatTime);
      this.nextBeat = (this.nextBeat + 1) % LOOP_BEATS;
      this.nextBeatTime += BEAT;
    }
  }

  private scheduleBeat(beat: number, time: number) {
    const barIndex = Math.floor(beat / BEATS_PER_BAR);
    const beatInBar = beat % BEATS_PER_BAR;
    const bar = BARS[barIndex];

    // Pads and pedal are re-struck once per bar and sustain across it.
    if (beatInBar === 0) {
      const barSeconds = BEATS_PER_BAR * BEAT;
      this.bass(noteToFreq(bar.bass), time, barSeconds);
      for (const note of bar.choir) {
        this.choir(noteToFreq(note), time, barSeconds);
      }
    }

    for (const offset of bar.drum) {
      if (offset === beatInBar) this.timpani(time);
    }

    for (const m of MELODY) {
      if (m.at === beat) this.brass(noteToFreq(m.note), time, m.beats * BEAT);
    }
  }

  /** Detuned saws through a low-passed formant pair — reads as "ahh" voices. */
  private choir(freq: number, start: number, dur: number) {
    const ctx = getAudioContext();
    const master = this.getMaster();

    const voice = ctx.createGain();
    voice.gain.value = 0;
    // Slow swell in and out; a choir does not have a percussive attack.
    voice.gain.setValueAtTime(0.0001, start);
    voice.gain.linearRampToValueAtTime(0.16, start + dur * 0.35);
    voice.gain.linearRampToValueAtTime(0.0001, start + dur);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1100;
    tone.Q.value = 0.6;
    tone.connect(voice);

    // Two formant peaks approximate a vowel rather than a raw saw.
    for (const [f, q, g] of [[720, 6, 1.0], [1180, 8, 0.7]] as const) {
      const formant = ctx.createBiquadFilter();
      formant.type = 'peaking';
      formant.frequency.value = f;
      formant.Q.value = q;
      formant.gain.value = 8 * g;
      tone.connect(formant);
      formant.connect(voice);
    }

    // Slight detune across three oscillators to get a section, not a soloist.
    for (const cents of [-8, 0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * Math.pow(2, cents / 1200);

      // Gentle vibrato so the pad breathes.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.6 + Math.random() * 0.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.connect(tone);
      osc.start(start);
      lfo.start(start);
      osc.stop(start + dur + 0.1);
      lfo.stop(start + dur + 0.1);
    }

    voice.connect(master);
  }

  /** Sub-octave pedal: sine for weight plus a filtered saw for growl. */
  private bass(freq: number, start: number, dur: number) {
    const ctx = getAudioContext();
    const master = this.getMaster();

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, start + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.connect(gain);

    const sine = ctx.createOscillator();
    sine.type = 'sine';
    sine.frequency.value = freq;
    sine.connect(gain);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = freq;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.35;
    saw.connect(sawGain);
    sawGain.connect(lp);

    sine.start(start);
    saw.start(start);
    sine.stop(start + dur + 0.1);
    saw.stop(start + dur + 0.1);

    gain.connect(master);
  }

  /** Low brass line: saw with a filter that opens as the note blooms. */
  private brass(freq: number, start: number, dur: number) {
    const ctx = getAudioContext();
    const master = this.getMaster();

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.13, start + 0.18);
    gain.gain.setValueAtTime(0.13, start + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, start + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    // The swelling filter is what makes it read as brass rather than a buzz.
    lp.frequency.setValueAtTime(400, start);
    lp.frequency.linearRampToValueAtTime(2400, start + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(700, start + dur);
    lp.connect(gain);

    for (const cents of [-5, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      osc.connect(lp);
      osc.start(start);
      osc.stop(start + dur + 0.1);
    }

    gain.connect(master);
  }

  /** Timpani: pitch-dropping sine plus a short noise thwack. */
  private timpani(start: number) {
    const ctx = getAudioContext();
    const master = this.getMaster();
    const dur = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, start);
    osc.frequency.exponentialRampToValueAtTime(46, start + 0.28);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + dur);

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(0.12);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, start);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    const noiseLp = ctx.createBiquadFilter();
    noiseLp.type = 'lowpass';
    noiseLp.frequency.value = 420;
    noise.connect(noiseLp);
    noiseLp.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(start);

    gain.connect(master);
  }
}

export const musicEngine = new MusicEngine();