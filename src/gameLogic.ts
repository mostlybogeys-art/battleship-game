import { Board, Cell, Position, Ship, Orientation, SHIP_CONFIGS, BOARD_SIZE } from './types';

export const createEmptyBoard = (): Board => {
  const cells: Cell[][] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    cells[row] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      cells[row][col] = { state: 'empty' };
    }
  }
  return { cells, ships: [] };
};

export const createShip = (config: typeof SHIP_CONFIGS[0], positions: Position[]): Ship => {
  return {
    id: config.id,
    name: config.name,
    size: config.size,
    positions,
    hits: 0,
    isSunk: false,
  };
};

export const isValidPlacement = (
  board: Board,
  positions: Position[]
): boolean => {
  for (const pos of positions) {
    // Check bounds
    if (pos.row < 0 || pos.row >= BOARD_SIZE || pos.col < 0 || pos.col >= BOARD_SIZE) {
      return false;
    }
    // Check for existing ships
    if (board.cells[pos.row][pos.col].state === 'ship') {
      return false;
    }
  }
  return true;
};

export const getShipPositions = (
  startRow: number,
  startCol: number,
  size: number,
  orientation: Orientation
): Position[] => {
  const positions: Position[] = [];
  for (let i = 0; i < size; i++) {
    if (orientation === 'horizontal') {
      positions.push({ row: startRow, col: startCol + i });
    } else {
      positions.push({ row: startRow + i, col: startCol });
    }
  }
  return positions;
};

export const placeShipOnBoard = (board: Board, ship: Ship): Board => {
  const newBoard = { ...board, cells: board.cells.map(row => [...row]), ships: [...board.ships] };
  
  for (const pos of ship.positions) {
    newBoard.cells[pos.row][pos.col] = { state: 'ship', shipId: ship.id };
  }
  
  newBoard.ships.push(ship);
  return newBoard;
};

// Lifts a ship back off the grid so the player can re-place it.
export const removeShipFromBoard = (board: Board, shipId: string): Board => {
  const ship = board.ships.find(s => s.id === shipId);
  if (!ship) return board;

  const newBoard = {
    ...board,
    cells: board.cells.map(row => [...row]),
    ships: board.ships.filter(s => s.id !== shipId),
  };

  for (const pos of ship.positions) {
    newBoard.cells[pos.row][pos.col] = { state: 'empty' };
  }

  return newBoard;
};

export const isValidAttack = (board: Board, row: number, col: number): boolean => {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return false;
  }
  const cell = board.cells[row][col];
  return cell.state !== 'hit' && cell.state !== 'miss';
};

export const performAttack = (
  board: Board,
  row: number,
  col: number
): { board: Board; hit: boolean; sunkShip: string | null } => {
  // Cells must be cloned individually — a `[...row]` copy shares the cell
  // objects with `board`, so mutating one would rewrite the caller's previous
  // state in place.
  const newBoard = {
    ...board,
    cells: board.cells.map(r => r.map(cell => ({ ...cell }))),
    ships: board.ships.map(ship => ({ ...ship })),
  };
  const cell = newBoard.cells[row][col];
  let sunkShip: string | null = null;
  let hit = false;
  
  if (cell.state === 'ship' && cell.shipId) {
    cell.state = 'hit';
    hit = true;
    const ship = newBoard.ships.find(s => s.id === cell.shipId);
    if (ship) {
      ship.hits += 1;
      if (ship.hits >= ship.size) {
        ship.isSunk = true;
        sunkShip = ship.name;
      }
    }
  } else {
    cell.state = 'miss';
  }
  
  return { board: newBoard, hit, sunkShip };
};

export const areAllShipsSunk = (board: Board): boolean => {
  return board.ships.every(ship => ship.isSunk);
};

export const getRandomValidPlacement = (board: Board, size: number): Position[] => {
  let attempts = 0;
  const maxAttempts = 1000;
  
  while (attempts < maxAttempts) {
    const orientation: Orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
    const startRow = Math.floor(Math.random() * BOARD_SIZE);
    const startCol = Math.floor(Math.random() * BOARD_SIZE);
    
    const positions = getShipPositions(startRow, startCol, size, orientation);
    
    if (isValidPlacement(board, positions)) {
      return positions;
    }
    attempts++;
  }
  
  throw new Error('Could not find valid placement');
};

// Always builds a complete fleet on a fresh grid. It deliberately takes no
// board: carrying cells over from an existing one while resetting `ships` to []
// stranded already-placed hulls on the grid as cells with no owning ship.
export const placeAllShipsRandomly = (): Board => {
  let newBoard: Board = createEmptyBoard();

  for (const config of SHIP_CONFIGS) {
    const positions = getRandomValidPlacement(newBoard, config.size);
    const ship = createShip(config, positions);
    newBoard = placeShipOnBoard(newBoard, ship);
  }
  
  return newBoard;
};