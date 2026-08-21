import { describe, it, expect } from 'vitest';
import { noteToFreq } from './audio';
import { BARS, MELODY, LOOP_BEATS, BEATS_PER_BAR } from './music';

// These cover the score as data and the note parser as maths. Neither touches
// AudioContext, so they run in plain node with no DOM or audio stub.

const pitchClass = (note: string) => /^([A-G][b#]?)/.exec(note)![1];

const ALL_NOTES = [
  ...BARS.flatMap(b => [b.bass, ...b.choir]),
  ...MELODY.map(m => m.note),
];

describe('noteToFreq', () => {
  it('anchors on A4 = 440Hz', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440, 5);
  });

  it('halves an octave down and doubles an octave up', () => {
    expect(noteToFreq('A3')).toBeCloseTo(220, 5);
    expect(noteToFreq('A5')).toBeCloseTo(880, 5);
    expect(noteToFreq('A1')).toBeCloseTo(55, 5);
  });

  it('places middle C correctly', () => {
    expect(noteToFreq('C4')).toBeCloseTo(261.626, 2);
  });

  it('spaces semitones by the twelfth root of two', () => {
    expect(noteToFreq('A#4') / noteToFreq('A4')).toBeCloseTo(Math.pow(2, 1 / 12), 6);
    expect(noteToFreq('C5') / noteToFreq('B4')).toBeCloseTo(Math.pow(2, 1 / 12), 6);
  });

  it('treats sharps and flats as enharmonic', () => {
    expect(noteToFreq('Bb4')).toBeCloseTo(noteToFreq('A#4'), 6);
    expect(noteToFreq('Db3')).toBeCloseTo(noteToFreq('C#3'), 6);
  });

  it('handles the low octaves the pedal uses', () => {
    expect(noteToFreq('D2')).toBeCloseTo(73.416, 2);
    expect(noteToFreq('Bb1')).toBeCloseTo(58.27, 2);
  });

  it('rejects unparseable input rather than returning NaN', () => {
    expect(() => noteToFreq('H4')).toThrow();
    expect(() => noteToFreq('A')).toThrow();
    expect(() => noteToFreq('')).toThrow();
    // A silently-NaN frequency would produce an inaudible or broken oscillator.
    expect(() => noteToFreq('Cb#2')).toThrow();
  });
});

describe('score data', () => {
  it('parses every note to a positive, finite frequency', () => {
    for (const note of ALL_NOTES) {
      const f = noteToFreq(note);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThan(0);
    }
  });

  it('stays in D aeolian', () => {
    // One flat (Bb), no sharps. A raised leading tone (C#) would make the
    // progression read as Western rather than modal, which is the whole point.
    const D_AEOLIAN = new Set(['D', 'E', 'F', 'G', 'A', 'Bb', 'C']);
    const outOfKey = [...new Set(ALL_NOTES.map(pitchClass))].filter(p => !D_AEOLIAN.has(p));
    expect(outOfKey).toEqual([]);
  });

  it('voices every bar as a real triad', () => {
    const TRIADS = [
      ['D', 'F', 'A'],   // Dm
      ['Bb', 'D', 'F'],  // Bb
      ['F', 'A', 'C'],   // F
      ['C', 'E', 'G'],   // C
    ];
    for (const [i, bar] of BARS.entries()) {
      const pcs = new Set(bar.choir.map(pitchClass));
      const matches = TRIADS.some(t => t.length === pcs.size && t.every(n => pcs.has(n)));
      expect(matches, `bar ${i + 1} voicing ${bar.choir.join(' ')} is not a triad`).toBe(true);
    }
  });

  it('roots each bar on a member of its own chord', () => {
    for (const [i, bar] of BARS.entries()) {
      const chord = new Set(bar.choir.map(pitchClass));
      expect(chord.has(pitchClass(bar.bass)), `bar ${i + 1} pedal is foreign to its chord`).toBe(true);
    }
  });

  it('voices the choir in a plausible male range', () => {
    // Roughly bass low E through tenor top A. Outside this the formant filters
    // stop reading as voices.
    for (const note of BARS.flatMap(b => b.choir)) {
      const f = noteToFreq(note);
      expect(f).toBeGreaterThan(noteToFreq('E2'));
      expect(f).toBeLessThan(noteToFreq('A4'));
    }
  });
});

describe('loop geometry', () => {
  it('is a whole number of bars', () => {
    expect(LOOP_BEATS).toBe(BARS.length * BEATS_PER_BAR);
    expect(LOOP_BEATS % BEATS_PER_BAR).toBe(0);
  });

  it('keeps every timpani hit inside its bar', () => {
    for (const [i, bar] of BARS.entries()) {
      for (const hit of bar.drum) {
        expect(hit, `bar ${i + 1}`).toBeGreaterThanOrEqual(0);
        expect(hit, `bar ${i + 1}`).toBeLessThan(BEATS_PER_BAR);
      }
    }
  });

  it('starts every melody note inside the loop', () => {
    for (const note of MELODY) {
      expect(note.at).toBeGreaterThanOrEqual(0);
      expect(note.at).toBeLessThan(LOOP_BEATS);
      expect(note.beats).toBeGreaterThan(0);
    }
  });

  it('does not let a melody note run past the end of the loop', () => {
    // A note overhanging the loop point would be cut off mid-phrase on repeat.
    for (const note of MELODY) {
      expect(note.at + note.beats).toBeLessThanOrEqual(LOOP_BEATS);
    }
  });

  it('keeps the melody monophonic', () => {
    // Overlapping notes on a single brass line would sound like an unintended
    // chord rather than a tune.
    const sorted = [...MELODY].sort((a, b) => a.at - b.at);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      expect(sorted[i].at, `note ${i} overlaps the one before it`).toBeGreaterThanOrEqual(prev.at + prev.beats);
    }
  });

  it('opens with atmosphere before stating the theme', () => {
    // The brass line is meant to enter after the harmony is established.
    const firstEntry = Math.min(...MELODY.map(m => m.at));
    expect(firstEntry).toBeGreaterThanOrEqual(BEATS_PER_BAR);
  });
});