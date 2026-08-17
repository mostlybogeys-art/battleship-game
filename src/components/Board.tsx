import React from 'react';
import { Cell } from './Cell';
import { Board as BoardType, CellState } from '../types';

interface BoardProps {
  board: BoardType;
  onCellClick?: (row: number, col: number) => void;
  showShips?: boolean;
  disabled?: boolean;
  label?: string;
}

export const Board: React.FC<BoardProps> = ({ 
  board, 
  onCellClick, 
  showShips = true, 
  disabled = false,
  label 
}) => {
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

  return (
    <div className="flex flex-col items-center">
      {label && <h3 className="text-lg font-semibold mb-2 text-gray-800">{label}</h3>}
      <div className="grid gap-0.5 bg-blue-200 p-2 rounded-lg shadow-lg">
        {/* Column labels */}
        <div className="flex">
          <div className="w-6 h-8 sm:w-8 sm:h-10 flex items-center justify-center" />
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="w-8 h-4 sm:w-10 sm:h-5 flex items-center justify-center text-xs font-bold text-gray-700">
              {i + 1}
            </div>
          ))}
        </div>
        
        {/* Board rows */}
        {board.cells.map((row, rowIndex) => (
          <div key={rowIndex} className="flex">
            {/* Row label */}
            <div className="w-6 h-8 sm:w-8 sm:h-10 flex items-center justify-center text-xs font-bold text-gray-700">
              {String.fromCharCode(65 + rowIndex)}
            </div>
            
            {/* Cells */}
            {row.map((cell, colIndex) => (
              <Cell
                key={`${rowIndex}-${colIndex}`}
                state={getCellState(rowIndex, colIndex)}
                onClick={() => onCellClick?.(rowIndex, colIndex)}
                disabled={disabled || !onCellClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};