import React from 'react';
import { CellState } from '../types';

interface CellProps {
  state: CellState;
  isPreview?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export const Cell: React.FC<CellProps> = ({ state, isPreview, onClick, disabled }) => {
  const getCellStyles = () => {
    const baseStyles = 'w-8 h-8 sm:w-10 sm:h-10 border border-blue-300 flex items-center justify-center transition-all duration-200';
    
    if (disabled) {
      return `${baseStyles} bg-gray-100 cursor-not-allowed opacity-60`;
    }
    
    switch (state) {
      case 'empty':
        return `${baseStyles} bg-blue-100 hover:bg-blue-200 cursor-pointer`;
      case 'ship':
        return `${baseStyles} bg-gray-700 hover:bg-gray-600 cursor-pointer`;
      case 'hit':
        return `${baseStyles} bg-red-500 cursor-not-allowed`;
      case 'miss':
        return `${baseStyles} bg-white cursor-not-allowed`;
      default:
        return baseStyles;
    }
  };

  const getCellContent = () => {
    if (state === 'hit') {
      return <span className="text-white text-xl">💥</span>;
    }
    if (state === 'miss') {
      return <span className="text-blue-400 text-xl">•</span>;
    }
    if (state === 'ship' && !isPreview) {
      return <span className="text-gray-400 text-lg">🚢</span>;
    }
    return null;
  };

  return (
    <div
      className={getCellStyles()}
      onClick={disabled ? undefined : onClick}
    >
      {getCellContent()}
    </div>
  );
};