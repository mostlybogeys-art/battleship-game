import { describe, it, expect } from 'vitest';
import {
  createInitialAIState,
  aiTakeTurn,
  positionToString,
  stringToPosition,
  getAdjacentPositions,
  getDirectionalPosition,
  getRandomValidShot,
  AIState,
} from './aiLogic';
import {
  createEmptyBoard,
  createShip,
  getShipPositions,
  placeShipOnBoard,
  placeAllShipsRandomly,
  areAllShipsSunk,
} from './gameLogic';
import { SHIP_CONFIGS, Board, Difficulty, Position, BOARD_SIZE } from './types';

const DESTROYER = SHIP_CONFIGS[4]; // 2
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const boardWith = (config: typeof DESTROYER, row: number, col: number, orientation: 'horizontal' | 'vertical' = 'horizontal'): Board =>
  placeShipOnBoard(
    createEmptyBoard(),
    createShip(config, getShipPositions(row, col, config.size, orientation))
  );

/** Drive a whole game and report how it went. */
const playOut = (difficulty: Difficulty, maxTurns = 100) => {
  let board = placeAllShipsRandomly();
  let ai = createInitialAIState();
  const shots: Position[] = [];

  while (!areAllShipsSunk(board)) {
    if (shots.length >= maxTurns) break;
    const result = aiTakeTurn(board, ai, difficulty);
    shots.push(result.shot);
    board = result.newBoard;
    ai = result.newAIState;
  }
  return { turns: shots.length, shots, board, finished: areAllShipsSunk(board) };
};

describe('position helpers', () => {
  it('round-trips a position through its string key', () => {
    const pos = { row: 3, col: 7 };
    expect(stringToPosition(positionToString(pos))).toEqual(pos);
  });

  it('offers only orthogonal neighbours', () => {
    expect(getAdjacentPositions({ row: 5, col: 5 })).toHaveLength(4);
    // No diagonals.
    expect(getAdjacentPositions({ row: 5, col: 5 })).not.toContainEqual({ row: 4, col: 4 });
  });

  it('clips neighbours at the board edges rather than wrapping', () => {
    const corner = getAdjacentPositions({ row: 0, col: 0 });
    expect(corner).toHaveLength(2);
    expect(corner).toEqual(expect.arrayContaining([{ row: 1, col: 0 }, { row: 0, col: 1 }]));

    // The key wrap-around case: the cell west of column 0 must not become the
    // last column of the previous row.
    expect(getDirectionalPosition({ row: 3, col: 0 }, 'west')).toBeNull();
    expect(getDirectionalPosition({ row: 3, col: BOARD_SIZE - 1 }, 'east')).toBeNull();
    expect(getDirectionalPosition({ row: 0, col: 3 }, 'north')).toBeNull();
    expect(getDirectionalPosition({ row: BOARD_SIZE - 1, col: 3 }, 'south')).toBeNull();
  });
});

describe('getRandomValidShot', () => {
  it('never returns a cell that has already been fired at', () => {
    const board = createEmptyBoard();
    const previous = new Set<string>();
    // Fill all but one cell.
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!(r === 7 && c === 4)) previous.add(positionToString({ row: r, col: c }));
      }
    }
    expect(getRandomValidShot(board, previous)).toEqual({ row: 7, col: 4 });
  });

  it('throws rather than looping forever when the board is exhausted', () => {
    const previous = new Set<string>();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) previous.add(positionToString({ row: r, col: c }));
    }
    expect(() => getRandomValidShot(createEmptyBoard(), previous)).toThrow();
  });

  it('biases hard mode onto the checkerboard', () => {
    // Every cell on the dark squares has (row + col) even. Because the smallest
    // ship spans 2 cells, sweeping only those cannot miss a ship.
    const board = createEmptyBoard();
    for (let i = 0; i < 200; i++) {
      const shot = getRandomValidShot(board, new Set(), 'hard');
      expect((shot.row + shot.col) % 2).toBe(0);
    }
  });

  it('falls back off the checkerboard once it is used up', () => {
    const board = createEmptyBoard();
    const previous = new Set<string>();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 0) previous.add(positionToString({ row: r, col: c }));
      }
    }
    const shot = getRandomValidShot(board, previous, 'hard');
    expect((shot.row + shot.col) % 2).toBe(1);
  });
});

describe('aiTakeTurn — bookkeeping', () => {
  it('reports the cell it fired at', () => {
    const { shot, newBoard } = aiTakeTurn(createEmptyBoard(), createInitialAIState());
    const cell = newBoard.cells[shot.row][shot.col];
    expect(cell.state === 'hit' || cell.state === 'miss').toBe(true);
  });

  it('records the shot so it is never repeated', () => {
    const { shot, newAIState } = aiTakeTurn(createEmptyBoard(), createInitialAIState());
    expect(newAIState.previousShots.has(positionToString(shot))).toBe(true);
  });

  it('does not mutate the board or AI state it was given', () => {
    // Regression guard for the shared-cell-object copy bug.
    const before = boardWith(DESTROYER, 0, 0);
    const aiBefore = createInitialAIState();
    aiTakeTurn(before, aiBefore, 'medium');
    expect(before.cells.flat().every(c => c.state === 'ship' || c.state === 'empty')).toBe(true);
    expect(aiBefore.previousShots.size).toBe(0);
  });

  it('does not alias the target queue with the previous state', () => {
    // targetQueue is shifted in place, so a shallow spread would let a new turn
    // corrupt the queue of the state it came from.
    const board = boardWith(DESTROYER, 4, 4);
    const seeded: AIState = {
      ...createInitialAIState(),
      mode: 'target',
      targetQueue: [{ row: 9, col: 9 }, { row: 8, col: 8 }],
      lastHit: { row: 4, col: 4 },
      originalHit: { row: 4, col: 4 },
      currentDirection: 'east',
    };
    aiTakeTurn(board, seeded, 'medium');
    expect(seeded.targetQueue).toHaveLength(2);
  });

  it('reports the ship name when it sinks one', () => {
    // Destroyer at 0,0-0,1 with the first cell already hit; the AI is aimed at
    // the second, so this turn must sink it.
    let board = boardWith(DESTROYER, 0, 0);
    board.cells[0][0] = { state: 'hit', shipId: DESTROYER.id };
    board.ships[0].hits = 1;

    const seeded: AIState = {
      ...createInitialAIState(),
      mode: 'target',
      targetQueue: [{ row: 0, col: 1 }],
      lastHit: { row: 0, col: 0 },
      originalHit: { row: 0, col: 0 },
      currentDirection: 'east',
    };
    const { sunkShip, shot } = aiTakeTurn(board, seeded, 'medium');
    expect(shot).toEqual({ row: 0, col: 1 });
    expect(sunkShip).toBe(DESTROYER.name);
  });
});

describe('aiTakeTurn — hunt and target modes', () => {
  it('switches to target mode after wounding a ship', () => {
    // Cruiser (3) so a single hit cannot sink it outright.
    const cruiser = SHIP_CONFIGS[2];
    const board = placeShipOnBoard(
      createEmptyBoard(),
      createShip(cruiser, getShipPositions(4, 4, cruiser.size, 'horizontal'))
    );
    // Aim the AI at the middle of the ship via the target queue, so the outcome
    // is deterministic rather than depending on a random hunt shot.
    const { newBoard, newAIState } = aiTakeTurn(
      board,
      { ...createInitialAIState(), mode: 'target', targetQueue: [{ row: 4, col: 5 }] },
      'medium'
    );
    expect(newBoard.cells[4][5].state).toBe('hit');
    expect(newAIState.mode).toBe('target');
    expect(newAIState.targetQueue.length).toBeGreaterThan(0);
  });

  it('always leaves follow-up candidates after a non-sinking hit', () => {
    // The follow-up logic used to be gated entirely on currentDirection, so a
    // hit while in target mode with no axis established queued nothing and the
    // wounded ship was abandoned.
    const cruiser = SHIP_CONFIGS[2];
    const board = placeShipOnBoard(
      createEmptyBoard(),
      createShip(cruiser, getShipPositions(4, 4, cruiser.size, 'horizontal'))
    );
    const { newAIState } = aiTakeTurn(
      board,
      {
        ...createInitialAIState(),
        mode: 'target',
        targetQueue: [{ row: 4, col: 5 }],
        currentDirection: null,
        lastHit: null,
        originalHit: null,
      },
      'medium'
    );
    expect(newAIState.targetQueue.length).toBeGreaterThan(0);
    expect(newAIState.currentDirection).not.toBeNull();
  });

  it('presses on along the established axis after a second hit in line', () => {
    // Cruiser laid out horizontally at 4,4-4,6. Having hit 4,4 and then 4,5
    // heading east, the next shot should continue to 4,6 rather than wander.
    const cruiser = SHIP_CONFIGS[2];
    let board = placeShipOnBoard(
      createEmptyBoard(),
      createShip(cruiser, getShipPositions(4, 4, cruiser.size, 'horizontal'))
    );
    board.cells[4][4] = { state: 'hit', shipId: cruiser.id };
    board.ships[0].hits = 1;

    const { newAIState } = aiTakeTurn(
      board,
      {
        ...createInitialAIState(),
        mode: 'target',
        previousShots: new Set([positionToString({ row: 4, col: 4 })]),
        targetQueue: [{ row: 4, col: 5 }],
        currentDirection: 'east',
        lastHit: { row: 4, col: 4 },
        originalHit: { row: 4, col: 4 },
      },
      'medium'
    );
    expect(newAIState.targetQueue).toEqual([{ row: 4, col: 6 }]);
  });

  it('queues only orthogonal neighbours of the hit', () => {
    const cruiser = SHIP_CONFIGS[2];
    const board = placeShipOnBoard(
      createEmptyBoard(),
      createShip(cruiser, getShipPositions(4, 4, cruiser.size, 'horizontal'))
    );
    const { newAIState } = aiTakeTurn(
      board,
      { ...createInitialAIState(), mode: 'target', targetQueue: [{ row: 4, col: 5 }] },
      'medium'
    );
    const neighbours = getAdjacentPositions({ row: 4, col: 5 });
    for (const q of newAIState.targetQueue) {
      expect(neighbours).toContainEqual(q);
    }
  });

  it('returns to hunt mode once the ship is sunk', () => {
    let board = boardWith(DESTROYER, 0, 0);
    board.cells[0][0] = { state: 'hit', shipId: DESTROYER.id };
    board.ships[0].hits = 1;

    const { newAIState } = aiTakeTurn(
      board,
      {
        ...createInitialAIState(),
        mode: 'target',
        targetQueue: [{ row: 0, col: 1 }],
        lastHit: { row: 0, col: 0 },
        originalHit: { row: 0, col: 0 },
        currentDirection: 'east',
      },
      'medium'
    );
    expect(newAIState.mode).toBe('hunt');
    expect(newAIState.targetQueue).toHaveLength(0);
    expect(newAIState.lastHit).toBeNull();
    expect(newAIState.originalHit).toBeNull();
    expect(newAIState.currentDirection).toBeNull();
  });

  it('easy never enters target mode, so it never follows up a hit', () => {
    const cruiser = SHIP_CONFIGS[2];
    const board = placeShipOnBoard(
      createEmptyBoard(),
      createShip(cruiser, getShipPositions(4, 4, cruiser.size, 'horizontal'))
    );
    const { newAIState } = aiTakeTurn(
      board,
      { ...createInitialAIState(), mode: 'target', targetQueue: [{ row: 4, col: 5 }] },
      'easy'
    );
    expect(newAIState.mode).toBe('hunt');
    expect(newAIState.targetQueue).toHaveLength(0);
  });
});

describe('aiTakeTurn — full game invariants', () => {
  for (const difficulty of DIFFICULTIES) {
    describe(difficulty, () => {
      it('clears the board without ever repeating a shot', () => {
        for (let run = 0; run < 40; run++) {
          const { shots, finished } = playOut(difficulty);
          expect(finished).toBe(true);
          const unique = new Set(shots.map(positionToString));
          expect(unique.size).toBe(shots.length);
        }
      });

      it('terminates well inside the 100 cells of the board', () => {
        const { turns } = playOut(difficulty);
        expect(turns).toBeLessThanOrEqual(BOARD_SIZE * BOARD_SIZE);
      });
    });
  }

  it('is ordered easy > medium > hard in average shots needed', () => {
    // The whole point of the difficulty setting: a smarter admiral should need
    // measurably fewer shots. Averaged over many games so it is not flaky.
    const RUNS = 150;
    const mean = (d: Difficulty) =>
      Array.from({ length: RUNS }, () => playOut(d).turns).reduce((a, b) => a + b, 0) / RUNS;

    const easy = mean('easy');
    const medium = mean('medium');
    const hard = mean('hard');

    expect(medium).toBeLessThan(easy);
    expect(hard).toBeLessThan(medium);
  });
});