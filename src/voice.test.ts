import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickCallout } from './voice';
import callouts from './assets/voice/callouts.json';

// Covers the pure rotation logic and, importantly, the correspondence between
// the callout text and the rendered audio. Driving the Web Audio graph itself
// would mean stubbing AudioContext to assert it was called, which tests the
// mock rather than the behaviour.
//
// voice.ts is not imported for the asset checks because it uses
// import.meta.glob on binary files; the text and the directory contents are
// compared directly instead.

const VOICE_DIR = join(__dirname, 'assets', 'voice');
const HIT_CALLOUTS: string[] = callouts.hit;
const audioFiles = () => readdirSync(VOICE_DIR).filter(f => /^hit-\d+\.m4a$/.test(f));

describe('callout text', () => {
  it('has the six requested lines, all distinct and non-empty', () => {
    expect(HIT_CALLOUTS).toHaveLength(6);
    expect(new Set(HIT_CALLOUTS).size).toBe(6);
    expect(HIT_CALLOUTS.every(l => l.trim().length > 0)).toBe(true);
  });
});

describe('rendered audio', () => {
  // The audio is generated from callouts.json by scripts/render-voice.sh. If
  // someone edits the text and forgets to re-run it, players hear one line and
  // read another. These checks make that drift fail the build.
  it('has exactly one file per callout', () => {
    expect(audioFiles()).toHaveLength(HIT_CALLOUTS.length);
  });

  it('is numbered contiguously from zero', () => {
    const indices = audioFiles()
      .map(f => Number(/^hit-(\d+)\.m4a$/.exec(f)![1]))
      .sort((a, b) => a - b);
    expect(indices).toEqual(HIT_CALLOUTS.map((_, i) => i));
  });

  it('contains real, non-trivial audio', () => {
    // A failed render can leave a valid but near-empty container behind.
    for (const file of audioFiles()) {
      const bytes = readFileSync(join(VOICE_DIR, file));
      expect(bytes.byteLength, `${file} is suspiciously small`).toBeGreaterThan(4000);
      expect(bytes.subarray(4, 8).toString('ascii'), `${file} is not MP4`).toBe('ftyp');
    }
  });

  it('stays small enough to ship', () => {
    // Guards against someone re-rendering at a wasteful bitrate.
    const total = audioFiles().reduce(
      (sum, f) => sum + readFileSync(join(VOICE_DIR, f)).byteLength,
      0
    );
    expect(total).toBeLessThan(400_000);
  });
});

describe('pickCallout', () => {
  it('returns a line from the list along with its own index', () => {
    const { line, index } = pickCallout(HIT_CALLOUTS, -1);
    expect(HIT_CALLOUTS).toContain(line);
    expect(HIT_CALLOUTS[index]).toBe(line);
  });

  it('never immediately repeats the previous line', () => {
    // Exhaustive: for every previous index, sweep the whole random range.
    for (let last = 0; last < HIT_CALLOUTS.length; last++) {
      for (let step = 0; step < 200; step++) {
        const r = step / 200;
        const { index } = pickCallout(HIT_CALLOUTS, last, () => r);
        expect(index, `last=${last} r=${r}`).not.toBe(last);
      }
    }
  });

  it('always stays in bounds', () => {
    for (let last = -1; last < HIT_CALLOUTS.length; last++) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999, 1]) {
        const { index } = pickCallout(HIT_CALLOUTS, last, () => r);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(HIT_CALLOUTS.length);
      }
    }
  });

  it('can still reach every other line', () => {
    // Skipping the previous index must not make some line unreachable.
    const last = 2;
    const seen = new Set<number>();
    for (let step = 0; step < 500; step++) {
      seen.add(pickCallout(HIT_CALLOUTS, last, () => step / 500).index);
    }
    expect(seen.size).toBe(HIT_CALLOUTS.length - 1);
    expect(seen.has(last)).toBe(false);
  });

  it('handles a single-line list without looping forever', () => {
    expect(pickCallout(['only'], 0)).toEqual({ line: 'only', index: 0 });
  });

  it('throws on an empty list rather than returning undefined', () => {
    expect(() => pickCallout([], -1)).toThrow();
  });

  it('produces a run with no consecutive duplicates', () => {
    let last = -1;
    const run: number[] = [];
    for (let i = 0; i < 300; i++) {
      const { index } = pickCallout(HIT_CALLOUTS, last);
      run.push(index);
      last = index;
    }
    for (let i = 1; i < run.length; i++) {
      expect(run[i]).not.toBe(run[i - 1]);
    }
  });
});
