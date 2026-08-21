// One AudioContext shared by the sound effects and the music engine. Browsers
// cap the number of contexts a page may create, and two independent contexts
// would also drift apart in time, so both subsystems go through here.

let ctx: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
};

// Autoplay policy starts the context suspended until the page sees a gesture.
// Every sound entry point calls this so the first click unlocks playback.
export const resumeAudio = () => {
  const c = getAudioContext();
  if (c.state === 'suspended') void c.resume();
};

export const createNoiseBuffer = (duration: number): AudioBuffer => {
  const c = getAudioContext();
  const length = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

// Semitone offsets from A within an octave, used to turn note names like
// "D3" or "Bb2" into frequencies.
const SEMITONES: Record<string, number> = {
  C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5,
  F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1,
  A: 0, 'A#': 1, Bb: 1, B: 2,
};

export const noteToFreq = (note: string): number => {
  const match = /^([A-G][b#]?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Unparseable note: ${note}`);
  const [, pitch, octaveStr] = match;
  const semitone = SEMITONES[pitch];
  if (semitone === undefined) throw new Error(`Unknown pitch class: ${pitch}`);
  // A4 = 440Hz is the reference.
  const octaveOffset = (Number(octaveStr) - 4) * 12;
  return 440 * Math.pow(2, (semitone + octaveOffset) / 12);
};