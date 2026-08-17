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
    const baseStyles =
      'w-8 h-8 sm:w-10 sm:h-10 border border-steel-700/60 flex items-center justify-center transition-all duration-200';

    // `disabled` only removes the affordance to click — it must never hide the
    // cell's actual state, or the board turns into an unreadable grey slab.
    const interaction = disabled
      ? 'cursor-not-allowed'
      : 'cursor-pointer';

    switch (state) {
      case 'empty':
        return `${baseStyles} ${interaction} bg-steel-800 ${
          disabled ? '' : 'hover:bg-steel-600 hover:ring-1 hover:ring-inset hover:ring-brass-400/60'
        }`;
      case 'ship':
        return `${baseStyles} ${interaction} bg-steel-300 ${disabled ? '' : 'hover:bg-steel-200'}`;
      case 'hit':
        return `${baseStyles} cursor-not-allowed bg-ember-600 shadow-[inset_0_0_10px_rgba(255,157,77,0.7)]`;
      case 'miss':
        return `${baseStyles} cursor-not-allowed bg-steel-900`;
      default:
        return `${baseStyles} ${interaction}`;
    }
  };

  const getCellContent = () => {
    if (state === 'hit') {
      return <span className="text-xl leading-none">💥</span>;
    }
    if (state === 'miss') {
      return <span className="text-steel-400 text-xl leading-none">•</span>;
    }
    if (state === 'ship' && !isPreview) {
      return <span className="text-steel-700 text-lg leading-none">🚢</span>;
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
