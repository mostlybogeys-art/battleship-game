import React, { useState, useEffect } from 'react';
import { Board } from './components/Board';
import { ShipSelector } from './components/ShipSelector';
import { 
  GameState, 
  Position, 
  Orientation, 
  SHIP_CONFIGS, 
  Ship 
} from './types';
import { 
  createEmptyBoard, 
  createShip, 
  getShipPositions, 
  isValidPlacement, 
  placeShipOnBoard, 
  isValidAttack, 
  performAttack, 
  areAllShipsSunk,
  placeAllShipsRandomly 
} from './gameLogic';
import { 
  createInitialAIState, 
  aiTakeTurn 
} from './aiLogic';

function App() {
  console.log('App component rendered');
  const [gameState, setGameState] = useState<GameState>(() => ({
    phase: 'setup',
    playerBoard: createEmptyBoard(),
    aiBoard: createEmptyBoard(),
    currentTurn: 'player',
    selectedShip: null,
    shipOrientation: 'horizontal',
    winner: null,
  }));

  const [aiState, setAIState] = useState(createInitialAIState());
  const [previewPositions, setPreviewPositions] = useState<Position[]>([]);
  const [isAIThinking, setIsAIThinking] = useState(false);

  // Reset game
  const resetGame = () => {
    setGameState({
      phase: 'setup',
      playerBoard: createEmptyBoard(),
      aiBoard: createEmptyBoard(),
      currentTurn: 'player',
      selectedShip: null,
      shipOrientation: 'horizontal',
      winner: null,
    });
    setAIState(createInitialAIState());
    setPreviewPositions([]);
    setIsAIThinking(false);
  };

  // Handle ship selection in setup phase
  const handleShipSelect = (ship: Ship) => {
    setGameState(prev => ({ ...prev, selectedShip: ship }));
    setPreviewPositions([]);
  };

  // Toggle ship orientation
  const toggleOrientation = () => {
    setGameState(prev => ({ 
      ...prev, 
      shipOrientation: prev.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal' 
    }));
    setPreviewPositions([]);
  };

  // Handle cell click in setup phase
  const handleSetupCellClick = (row: number, col: number) => {
    if (!gameState.selectedShip) return;

    const positions = getShipPositions(
      row, 
      col, 
      gameState.selectedShip.size, 
      gameState.shipOrientation
    );

    if (isValidPlacement(gameState.playerBoard, positions)) {
      const newShip = createShip(gameState.selectedShip, positions);
      const newBoard = placeShipOnBoard(gameState.playerBoard, newShip);
      
      setGameState(prev => ({
        ...prev,
        playerBoard: newBoard,
        selectedShip: null,
      }));
      setPreviewPositions([]);
    }
  };

  // Handle cell hover in setup phase for preview
  const handleSetupCellHover = (row: number, col: number) => {
    if (!gameState.selectedShip) return;

    const positions = getShipPositions(
      row, 
      col, 
      gameState.selectedShip.size, 
      gameState.shipOrientation
    );

    setPreviewPositions(isValidPlacement(gameState.playerBoard, positions) ? positions : []);
  };

  // Randomize fleet placement
  const randomizeFleet = () => {
    const newBoard = placeAllShipsRandomly(gameState.playerBoard);
    setGameState(prev => ({
      ...prev,
      playerBoard: newBoard,
      selectedShip: null,
    }));
    setPreviewPositions([]);
  };

  // Start game (transition to combat phase)
  const startGame = () => {
    if (gameState.playerBoard.ships.length !== 5) return;

    // Place AI ships randomly
    const aiBoard = placeAllShipsRandomly(createEmptyBoard());
    
    setGameState(prev => ({
      ...prev,
      phase: 'combat',
      aiBoard,
      currentTurn: 'player',
    }));
  };

  // Handle player attack in combat phase
  const handlePlayerAttack = (row: number, col: number) => {
    if (gameState.currentTurn !== 'player' || gameState.phase !== 'combat') return;
    if (!isValidAttack(gameState.aiBoard, row, col)) return;

    const newAIBoard = performAttack(gameState.aiBoard, row, col);
    
    setGameState(prev => ({
      ...prev,
      aiBoard: newAIBoard,
      currentTurn: 'ai',
    }));

    // Check for win
    if (areAllShipsSunk(newAIBoard)) {
      setGameState(prev => ({
        ...prev,
        phase: 'gameover',
        winner: 'player',
      }));
    }
  };

  // AI turn effect
  useEffect(() => {
    if (gameState.currentTurn === 'ai' && gameState.phase === 'combat' && !isAIThinking) {
      setIsAIThinking(true);
      
      // Simulate AI thinking time
      const thinkingTime = Math.random() * 1000 + 500; // 500-1500ms
      
      setTimeout(() => {
        const { newBoard, newAIState: newAIState } = aiTakeTurn(gameState.playerBoard, aiState);
        
        setGameState(prev => ({
          ...prev,
          playerBoard: newBoard,
          currentTurn: 'player',
        }));
        
        setAIState(newAIState);
        setIsAIThinking(false);

        // Check for AI win
        if (areAllShipsSunk(newBoard)) {
          setGameState(prev => ({
            ...prev,
            phase: 'gameover',
            winner: 'ai',
          }));
        }
      }, thinkingTime);
    }
  }, [gameState.currentTurn, gameState.phase, aiState, isAIThinking, gameState.playerBoard]);

  const allShipsPlaced = gameState.playerBoard.ships.length === 5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">⚓ Battleship</h1>
        
        {gameState.phase === 'setup' && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Setup Phase</h2>
              <p className="text-gray-600">Place your ships on the board to begin the game</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 justify-center items-start">
              {/* Ship Selector */}
              <ShipSelector
                placedShips={gameState.playerBoard.ships}
                selectedShip={gameState.selectedShip}
                onShipSelect={handleShipSelect}
              />

              {/* Controls */}
              <div className="bg-white p-4 rounded-lg shadow-md space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Controls</h3>
                
                <button
                  onClick={toggleOrientation}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors text-gray-800"
                >
                  Orientation: {gameState.shipOrientation.toUpperCase()}
                </button>

                <button
                  onClick={randomizeFleet}
                  className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md transition-colors"
                >
                  🎲 Randomize Fleet
                </button>

                {allShipsPlaced && (
                  <button
                    onClick={startGame}
                    className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors font-semibold"
                  >
                    🚀 Start Game
                  </button>
                )}
              </div>

              {/* Board */}
              <div className="flex-1">
                <Board
                  board={gameState.playerBoard}
                  onCellClick={handleSetupCellClick}
                  showShips={true}
                  disabled={false}
                  label="Your Board"
                />
              </div>
            </div>
          </div>
        )}

        {gameState.phase === 'combat' && (
          <div className="space-y-6">
            {/* Status Indicator */}
            <div className="text-center">
              <div className={`inline-block px-6 py-3 rounded-full text-lg font-semibold ${
                gameState.currentTurn === 'player' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {gameState.currentTurn === 'player' ? '🎯 Your Turn' : '🤖 AI is thinking...'}
              </div>
            </div>

            {/* Boards */}
            <div className="flex flex-col xl:flex-row gap-8 justify-center items-center">
              <Board
                board={gameState.playerBoard}
                showShips={true}
                disabled={true}
                label="Your Board"
              />

              <Board
                board={gameState.aiBoard}
                onCellClick={handlePlayerAttack}
                showShips={false}
                disabled={gameState.currentTurn !== 'player'}
                label="AI Board (Click to Attack)"
              />
            </div>

            {/* Ship Status */}
            <div className="flex justify-center gap-8">
              <div className="bg-white p-4 rounded-lg shadow-md">
                <h3 className="font-semibold text-gray-800 mb-2">Your Ships</h3>
                <div className="space-y-1">
                  {gameState.playerBoard.ships.map(ship => (
                    <div key={ship.id} className={`text-sm ${ship.isSunk ? 'text-red-500 line-through' : 'text-gray-700'}`}>
                      {ship.name} {ship.isSunk ? '(Sunk)' : `(${ship.hits}/${ship.size})`}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-md">
                <h3 className="font-semibold text-gray-800 mb-2">AI Ships</h3>
                <div className="space-y-1">
                  {gameState.aiBoard.ships.map(ship => (
                    <div key={ship.id} className={`text-sm ${ship.isSunk ? 'text-red-500 line-through' : 'text-gray-700'}`}>
                      {ship.name} {ship.isSunk ? '(Sunk)' : `(${ship.hits}/${ship.size})`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {gameState.phase === 'gameover' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full mx-4 text-center">
              <h2 className="text-3xl font-bold mb-4">
                {gameState.winner === 'player' ? '🎉 You Win!' : '🤖 AI Wins!'}
              </h2>
              <p className="text-gray-600 mb-6">
                {gameState.winner === 'player' 
                  ? 'Congratulations! You sunk all AI ships!' 
                  : 'The AI sunk all your ships. Better luck next time!'}
              </p>
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-semibold"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;