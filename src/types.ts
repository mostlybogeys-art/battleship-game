export type CellState = 'empty' | 'ship' | 'hit' | 'miss';
export type Orientation = 'horizontal' | 'vertical';
export type GamePhase = 'setup' | 'combat' | 'gameover';
export type Turn = 'player' | 'ai';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Position {
  row: number;
  col: number;
}

export interface Ship {
  id: string;
  name: string;
  size: number;
  positions: Position[];
  hits: number;
  isSunk: boolean;
}

export interface Cell {
  state: CellState;
  shipId?: string;
}

export interface Board {
  cells: Cell[][];
  ships: Ship[];
}

export interface GameState {
  phase: GamePhase;
  playerBoard: Board;
  aiBoard: Board;
  currentTurn: Turn;
  selectedShip: Ship | null;
  shipOrientation: Orientation;
  winner: Turn | null;
  difficulty: Difficulty;
}

export const SHIP_CONFIGS = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

export const BOARD_SIZE = 10;
export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const COL_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];