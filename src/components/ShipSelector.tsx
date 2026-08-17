import React from 'react';
import { Ship as ShipType, SHIP_CONFIGS } from '../types';

interface ShipSelectorProps {
  placedShips: ShipType[];
  selectedShip: ShipType | null;
  onShipSelect: (ship: ShipType) => void;
}

export const ShipSelector: React.FC<ShipSelectorProps> = ({ 
  placedShips, 
  selectedShip, 
  onShipSelect 
}) => {
  const unplacedShips = SHIP_CONFIGS.filter(
    config => !placedShips.some(ship => ship.id === config.id)
  );

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-3 text-gray-800">Ships to Place</h3>
      <div className="space-y-2">
        {unplacedShips.map(config => (
          <button
            key={config.id}
            onClick={() => onShipSelect({ ...config, positions: [], hits: 0, isSunk: false })}
            className={`w-full text-left px-4 py-2 rounded-md transition-colors ${
              selectedShip?.id === config.id
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
            }`}
          >
            <div className="flex justify-between items-center">
              <span>{config.name}</span>
              <span className="text-sm opacity-75">Size: {config.size}</span>
            </div>
          </button>
        ))}
        {unplacedShips.length === 0 && (
          <p className="text-green-600 font-semibold">All ships placed!</p>
        )}
      </div>
    </div>
  );
};