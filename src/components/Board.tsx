import { Cell, PreviewState } from './Cell';
import { Board as BoardType, CellState, Position } from '../types';
import { positionToString } from '../aiLogic';

interface BoardProps {
  board: BoardType;
  onCellClick?: (row: number, col: number) => void;
  onCellHover?: (row: number, col: number) => void;
  onLeave?: () => void;
  showShips?: boolean;
  disabled?: boolean;
  label?: string;
  lastShot?: Position | null;
  shake?: boolean;
  previewPositions?: Position[];
  previewState?: PreviewState;
}

export const Board = ({
  board,
  onCellClick,
  onCellHover,
  onLeave,
  showShips = true,
  disabled = false,
  label,
  lastShot,
  shake,
  previewPositions,
  previewState = 'valid',
}: BoardProps) => {
  const getCellState = (row: number, col: number): CellState => {
    const cell = board.cells[row][col];

    if (cell.state === 'hit' || cell.state === 'miss') {
      return cell.state;
    }

    if (showShips && cell.state === 'ship') {
      return 'ship';
    }

    return 'empty';
  };

  const previewSet = new Set((previewPositions ?? []).map(positionToString));

  const isLastShot = (row: number, col: number) =>
    lastShot != null && lastShot.row === row && lastShot.col === col;

  return (
    <div className={`flex flex-col items-center ${shake ? 'animate-shake' : ''}`}>
      {label && (
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] mb-2 text-brass-300">
          {label}
        </h3>
      )}
      <div
        className="grid gap-0.5 bg-steel-900 border border-steel-700 p-2 rounded-lg shadow-2xl"
        onMouseLeave={onLeave}
      >
        {/* Column labels */}
        <div className="flex">
          <div className="w-6 h-8 sm:w-8 sm:h-10 flex items-center justify-center" />
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="w-8 h-4 sm:w-10 sm:h-5 flex items-center justify-center text-xs font-bold text-steel-300">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Board rows */}
        {board.cells.map((row, rowIndex) => (
          <div key={rowIndex} className="flex">
            {/* Row label */}
            <div className="w-6 h-8 sm:w-8 sm:h-10 flex items-center justify-center text-xs font-bold text-steel-300">
              {String.fromCharCode(65 + rowIndex)}
            </div>

            {/* Cells */}
            {row.map((_cell, colIndex) => {
              const state = getCellState(rowIndex, colIndex);
              const isShot = isLastShot(rowIndex, colIndex);
              const inPreview = previewSet.has(positionToString({ row: rowIndex, col: colIndex }));
              return (
                <Cell
                  key={`${rowIndex}-${colIndex}`}
                  state={state}
                  onClick={() => onCellClick?.(rowIndex, colIndex)}
                  onHover={onCellHover ? () => onCellHover(rowIndex, colIndex) : undefined}
                  disabled={disabled || !onCellClick}
                  justHit={isShot && state === 'hit'}
                  justMissed={isShot && state === 'miss'}
                  preview={inPreview ? previewState : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};