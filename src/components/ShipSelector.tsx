import { Ship as ShipType, SHIP_CONFIGS } from '../types';

interface ShipSelectorProps {
  placedShips: ShipType[];
  selectedShip: ShipType | null;
  onShipSelect: (ship: ShipType) => void;
}

export const ShipSelector = ({ 
  placedShips, 
  selectedShip, 
  onShipSelect 
}: ShipSelectorProps) => {
  const unplacedShips = SHIP_CONFIGS.filter(
    config => !placedShips.some(ship => ship.id === config.id)
  );

  return (
    <div className="bg-steel-900/90 border border-steel-700 p-4 rounded-lg shadow-xl">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] mb-3 text-brass-300">
        Ships to Place
      </h3>
      <div className="space-y-2">
        {unplacedShips.map(config => (
          <button
            key={config.id}
            onClick={() => onShipSelect({ ...config, positions: [], hits: 0, isSunk: false })}
            className={`w-full text-left px-4 py-2 rounded-md border transition-colors ${
              selectedShip?.id === config.id
                ? 'bg-brass-500 border-brass-400 text-steel-950 font-semibold'
                : 'bg-steel-800 border-steel-700 hover:bg-steel-700 hover:border-steel-600 text-steel-100'
            }`}
          >
            <div className="flex justify-between items-center">
              <span>{config.name}</span>
              <span className="text-sm opacity-75">Size: {config.size}</span>
            </div>
          </button>
        ))}
        {unplacedShips.length === 0 && (
          <p className="text-brass-300 font-semibold">All ships placed!</p>
        )}
      </div>
    </div>
  );
};