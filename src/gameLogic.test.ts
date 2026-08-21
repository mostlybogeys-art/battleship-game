import { describe, it, expect } from 'vitest';
import {
  createEmptyBoard,
  createShip,
  getShipPositions,
  isValidPlacement,
  placeShipOnBoard,
  removeShipFromBoard,
  isValidAttack,
  performAttack,
  areAllShipsSunk,
  placeAllShipsRandomly,
} from './gameLogic';
import { SHIP_CONFIGS, BOARD_SIZE, Board } from './types';

const CARRIER = SHIP_CONFIGS[0]; // 5
const DESTROYER = SHIP_CONFIGS[4]; // 2
const FLEET_CELLS = SHIP_CONFIGS.reduce((sum, c) => sum + c.size, 0); // 17

const shipCellCount = (board: Board) =>
  board.cells.flat().filter(c => c.state === 'ship').length;

const place = (board: Board, config: typeof CARRIER, row: number, col: number, orientation: 'horizontal' | 'vertical' = 'horizontal') =>
  placeShipOnBoard(board, createShip(config, getShipPositions(row, col, config.size, orientation)));

describe('createEmptyBoard', () => {
  it('is 10x10 and entirely empty', () => {
    const board = createEmptyBoard();
    expect(board.cells).toHaveLength(BOARD_SIZE);
    expect(board.cells.every(r => r.length === BOARD_SIZE)).toBe(true);
    expect(board.cells.flat().every(c => c.state === 'empty')).toBe(true);
    expect(board.ships).toHaveLength(0);
  });

  it('does not share cell objects between rows', () => {
    // A board built by filling rows with the same object reference would let one
    // attack mark ten cells at once.
    const board = createEmptyBoard();
    board.cells[0][0].state = 'hit';
    expect(board.cells[1][0].state).toBe('empty');
    expect(board.cells[0][1].state).toBe('empty');
  });
});

describe('getShipPositions', () => {
  it('lays cells out along the requested axis', () => {
    expect(getShipPositions(2, 3, 3, 'horizontal')).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ]);
    expect(getShipPositions(2, 3, 3, 'vertical')).toEqual([
      { row: 2, col: 3 },
      { row: 3, col: 3 },
      { row: 4, col: 3 },
    ]);
  });

  it('never changes row for a horizontal ship', () => {
    // Regression guard for edge wrap-around: a horizontal ship must stay on one
    // row even when it overflows, so validation can reject it.
    const positions = getShipPositions(0, 8, CARRIER.size, 'horizontal');
    expect(positions.every(p => p.row === 0)).toBe(true);
  });

  it('never changes column for a vertical ship', () => {
    const positions = getShipPositions(8, 0, CARRIER.size, 'vertical');
    expect(positions.every(p => p.col === 0)).toBe(true);
  });
});

describe('isValidPlacement', () => {
  const empty = createEmptyBoard();

  it('accepts a placement that ends exactly on the last column', () => {
    expect(isValidPlacement(empty, getShipPositions(0, 5, CARRIER.size, 'horizontal'))).toBe(true);
  });

  it('accepts a placement that ends exactly on the last row', () => {
    expect(isValidPlacement(empty, getShipPositions(5, 0, CARRIER.size, 'vertical'))).toBe(true);
  });

  it('rejects horizontal overflow instead of wrapping to the next row', () => {
    // The explicit edge case from the brief. Cols 8..12 must fail, not silently
    // wrap round to row 1.
    expect(isValidPlacement(empty, getShipPositions(0, 8, CARRIER.size, 'horizontal'))).toBe(false);
  });

  it('rejects vertical overflow past the last row', () => {
    expect(isValidPlacement(empty, getShipPositions(8, 0, CARRIER.size, 'vertical'))).toBe(false);
  });

  it('rejects negative coordinates', () => {
    expect(isValidPlacement(empty, [{ row: -1, col: 0 }])).toBe(false);
    expect(isValidPlacement(empty, [{ row: 0, col: -1 }])).toBe(false);
  });

  it('rejects overlapping an existing hull', () => {
    const board = place(createEmptyBoard(), CARRIER, 0, 0);
    expect(isValidPlacement(board, getShipPositions(0, 4, DESTROYER.size, 'horizontal'))).toBe(false);
  });

  it('allows ships to sit adjacent without overlapping', () => {
    const board = place(createEmptyBoard(), CARRIER, 0, 0);
    expect(isValidPlacement(board, getShipPositions(1, 0, DESTROYER.size, 'horizontal'))).toBe(true);
  });
});

describe('placeShipOnBoard', () => {
  it('marks every cell and registers the ship', () => {
    const board = place(createEmptyBoard(), DESTROYER, 4, 4);
    expect(board.ships).toHaveLength(1);
    expect(board.cells[4][4].state).toBe('ship');
    expect(board.cells[4][5].state).toBe('ship');
    expect(board.cells[4][4].shipId).toBe(DESTROYER.id);
  });

  it('does not mutate the board it was given', () => {
    const before = createEmptyBoard();
    place(before, DESTROYER, 4, 4);
    expect(before.cells[4][4].state).toBe('empty');
    expect(before.ships).toHaveLength(0);
  });
});

describe('removeShipFromBoard', () => {
  it('clears the hull and deregisters the ship', () => {
    const board = place(createEmptyBoard(), CARRIER, 3, 3);
    const removed = removeShipFromBoard(board, CARRIER.id);
    expect(removed.ships).toHaveLength(0);
    expect(removed.cells.flat().every(c => c.state === 'empty')).toBe(true);
  });

  it('does not mutate the board it was given', () => {
    const board = place(createEmptyBoard(), CARRIER, 3, 3);
    removeShipFromBoard(board, CARRIER.id);
    expect(board.cells[3][3].state).toBe('ship');
  });

  it('is a no-op for an unknown ship id', () => {
    const board = place(createEmptyBoard(), CARRIER, 3, 3);
    expect(removeShipFromBoard(board, 'not-a-ship')).toBe(board);
  });

  it('removes only the requested ship from a full fleet', () => {
    const full = placeAllShipsRandomly();
    const minus = removeShipFromBoard(full, CARRIER.id);
    expect(minus.ships).toHaveLength(SHIP_CONFIGS.length - 1);
    expect(shipCellCount(minus)).toBe(FLEET_CELLS - CARRIER.size);
  });

  it('leaves no hull cell pointing at a removed ship', () => {
    // This is the failure mode behind the earlier "randomize stranded ships" bug.
    const minus = removeShipFromBoard(placeAllShipsRandomly(), CARRIER.id);
    const liveIds = new Set(minus.ships.map(s => s.id));
    const orphans = minus.cells
      .flat()
      .filter(c => c.state === 'ship' && !liveIds.has(c.shipId!));
    expect(orphans).toHaveLength(0);
  });

  it('allows a ship to be lifted and re-placed elsewhere', () => {
    let board = place(createEmptyBoard(), CARRIER, 3, 3);
    board = removeShipFromBoard(board, CARRIER.id);
    board = place(board, CARRIER, 7, 2);
    expect(board.cells[3][3].state).toBe('empty');
    expect(board.cells[7][2].state).toBe('ship');
    expect(board.ships).toHaveLength(1);
  });
});

describe('isValidAttack', () => {
  it('permits firing at water and at an unhit hull', () => {
    const board = place(createEmptyBoard(), DESTROYER, 0, 0);
    expect(isValidAttack(board, 5, 5)).toBe(true);
    expect(isValidAttack(board, 0, 0)).toBe(true);
  });

  it('refuses a cell that has already been fired at', () => {
    const { board } = performAttack(createEmptyBoard(), 5, 5);
    expect(isValidAttack(board, 5, 5)).toBe(false);
  });

  it('refuses out-of-bounds coordinates', () => {
    const board = createEmptyBoard();
    expect(isValidAttack(board, -1, 0)).toBe(false);
    expect(isValidAttack(board, 0, BOARD_SIZE)).toBe(false);
  });
});

describe('performAttack', () => {
  it('records a miss on open water', () => {
    const { board, hit, sunkShip } = performAttack(createEmptyBoard(), 5, 5);
    expect(hit).toBe(false);
    expect(sunkShip).toBeNull();
    expect(board.cells[5][5].state).toBe('miss');
  });

  it('records a hit and increments the ship', () => {
    const start = place(createEmptyBoard(), DESTROYER, 0, 0);
    const { board, hit, sunkShip } = performAttack(start, 0, 0);
    expect(hit).toBe(true);
    expect(sunkShip).toBeNull(); // 1 of 2 — not sunk yet
    expect(board.cells[0][0].state).toBe('hit');
    expect(board.ships[0].hits).toBe(1);
    expect(board.ships[0].isSunk).toBe(false);
  });

  it('reports the ship name on the killing blow', () => {
    let board = place(createEmptyBoard(), DESTROYER, 0, 0);
    board = performAttack(board, 0, 0).board;
    const final = performAttack(board, 0, 1);
    expect(final.sunkShip).toBe(DESTROYER.name);
    expect(final.board.ships[0].isSunk).toBe(true);
  });

  it('does not mutate the board it was given', () => {
    // Regression guard: cells were previously copied with [...row], which shares
    // the cell objects, so an attack rewrote the caller's previous state.
    const before = place(createEmptyBoard(), DESTROYER, 0, 0);
    performAttack(before, 0, 0);
    expect(before.cells[0][0].state).toBe('ship');
    expect(before.ships[0].hits).toBe(0);
  });

  it('does not mutate ship objects on the previous board', () => {
    const before = place(createEmptyBoard(), DESTROYER, 0, 0);
    const after = performAttack(before, 0, 0).board;
    expect(before.ships[0]).not.toBe(after.ships[0]);
    expect(before.ships[0].hits).toBe(0);
  });
});

describe('areAllShipsSunk', () => {
  it('is false while any ship survives', () => {
    const board = place(createEmptyBoard(), DESTROYER, 0, 0);
    expect(areAllShipsSunk(board)).toBe(false);
  });

  it('is true once every ship is sunk', () => {
    let board = place(createEmptyBoard(), DESTROYER, 0, 0);
    board = performAttack(board, 0, 0).board;
    board = performAttack(board, 0, 1).board;
    expect(areAllShipsSunk(board)).toBe(true);
  });
});

describe('placeAllShipsRandomly', () => {
  it('always produces a legal, complete fleet', () => {
    // Randomised, so run it enough times to catch a rare bad layout.
    for (let i = 0; i < 300; i++) {
      const board = placeAllShipsRandomly();
      expect(board.ships).toHaveLength(SHIP_CONFIGS.length);
      expect(shipCellCount(board)).toBe(FLEET_CELLS);

      // Every hull cell must belong to a registered ship, and every ship must
      // occupy exactly its own size in contiguous cells.
      const liveIds = new Set(board.ships.map(s => s.id));
      expect(board.cells.flat().every(c => c.state !== 'ship' || liveIds.has(c.shipId!))).toBe(true);

      for (const ship of board.ships) {
        expect(ship.positions).toHaveLength(ship.size);
        const rows = new Set(ship.positions.map(p => p.row));
        const cols = new Set(ship.positions.map(p => p.col));
        // Straight line: either all one row or all one column.
        expect(rows.size === 1 || cols.size === 1).toBe(true);
        for (const p of ship.positions) {
          expect(board.cells[p.row][p.col].shipId).toBe(ship.id);
        }
      }
    }
  });

  it('starts from a fresh grid rather than inheriting cells', () => {
    // Regression guard: it used to accept a board and reset `ships` to [], which
    // stranded already-placed hulls as cells with no owning ship.
    const board = placeAllShipsRandomly();
    expect(shipCellCount(board)).toBe(FLEET_CELLS);
  });
});