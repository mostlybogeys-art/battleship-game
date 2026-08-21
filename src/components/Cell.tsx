import { CellState } from '../types';

export type PreviewState = 'valid' | 'invalid';

interface CellProps {
  state: CellState;
  isPreview?: boolean;
  onClick?: () => void;
  onHover?: () => void;
  disabled?: boolean;
  animate?: boolean;
  justHit?: boolean;
  justMissed?: boolean;
  preview?: PreviewState;
}

export const Cell = ({
  state,
  isPreview,
  onClick,
  onHover,
  disabled,
  animate,
  justHit,
  justMissed,
  preview,
}: CellProps) => {
  const getCellStyles = () => {
    const baseStyles =
      'w-8 h-8 sm:w-10 sm:h-10 border border-steel-700/60 flex items-center justify-center';

    const animation = animate ? 'transition-all duration-200' : '';

    const interaction = disabled ? 'cursor-not-allowed' : 'cursor-pointer';

    // A placement preview overrides the underlying water/ship colour so the
    // player can see exactly which cells the ship will occupy.
    if (preview) {
      const previewStyle =
        preview === 'valid'
          ? 'bg-brass-400 ring-1 ring-inset ring-brass-200'
          : 'bg-ember-700 ring-1 ring-inset ring-ember-500';
      return `${baseStyles} ${animation} ${interaction} ${previewStyle}`;
    }

    switch (state) {
      case 'empty':
        return `${baseStyles} ${animation} ${interaction} bg-steel-800 ${
          disabled ? '' : 'hover:bg-steel-600 hover:ring-1 hover:ring-inset hover:ring-brass-400/60'
        }`;
      case 'ship':
        return `${baseStyles} ${animation} ${interaction} bg-steel-300 ${disabled ? '' : 'hover:bg-steel-200'}`;
      case 'hit':
        return `${baseStyles} ${justHit ? 'animate-explode' : ''} cursor-not-allowed bg-ember-600 shadow-[inset_0_0_10px_rgba(255,157,77,0.7)]`;
      case 'miss':
        return `${baseStyles} ${justMissed ? 'animate-splash' : ''} cursor-not-allowed bg-steel-900`;
      default:
        return `${baseStyles} ${animation} ${interaction}`;
    }
  };

  const getCellContent = () => {
    if (preview) return null;
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
      onMouseEnter={onHover}
    >
      {getCellContent()}
    </div>
  );
};