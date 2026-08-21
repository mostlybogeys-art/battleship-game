import { Ship as ShipType, SHIP_CONFIGS } from '../types';

interface ShipSelectorProps {
  placedShips: ShipType[];
  selectedShip: ShipType | null;
  onShipSelect: (ship: ShipType) => void;
  onShipRemove: (shipId: string) => void;
}

export const ShipSelector = ({
  placedShips,
  selectedShip,
  onShipSelect,
  onShipRemove,
}: ShipSelectorProps) => {
  const isPlaced = (id: string) => placedShips.some(ship => ship.id === id);

  return (
    <div className="bg-steel-900/90 border border-steel-700 p-4 rounded-lg shadow-xl min-w-[15rem]">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] mb-3 text-brass-300">
        Your Fleet
      </h3>
      <div className="space-y-2">
        {SHIP_CONFIGS.map(config => {
          const placed = isPlaced(config.id);
          const selected = selectedShip?.id === config.id;

          return (
            <button
              key={config.id}
              onClick={() =>
                placed
                  ? onShipRemove(config.id)
                  : onShipSelect({ ...config, positions: [], hits: 0, isSunk: false })
              }
              className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                selected
                  ? 'bg-brass-500 border-brass-400 text-steel-950 font-semibold'
                  : placed
                  ? 'bg-steel-800/50 border-steel-700/50 text-steel-400'
                  : 'bg-steel-800 border-steel-700 hover:bg-steel-700 hover:border-steel-600 text-steel-100'
              }`}
            >
              <div className="flex justify-between items-center gap-2">
                <span className="flex items-center gap-2">
                  {placed && <span className="text-brass-400">✓</span>}
                  <span>{config.name}</span>
                </span>
                <span className="text-xs opacity-75 whitespace-nowrap">
                  {placed ? 'Remove' : '▪'.repeat(config.size)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-steel-400 mt-3 leading-relaxed">
        {selectedShip
          ? `Click the grid to place your ${selectedShip.name}.`
          : placedShips.length === SHIP_CONFIGS.length
          ? 'Fleet ready. Weigh anchor!'
          : 'Pick a ship, then click the grid.'}
      </p>
    </div>
  );
};