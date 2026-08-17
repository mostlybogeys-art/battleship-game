import { useState, useEffect } from 'react';
import { Board } from './components/Board';
import { ShipSelector } from './components/ShipSelector';
import { 
  GameState, 
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
import captainImg from './assets/captain.jpg';

function App() {
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
    setIsAIThinking(false);
  };

  // Handle ship selection in setup phase
  const handleShipSelect = (ship: Ship) => {
    setGameState(prev => ({ ...prev, selectedShip: ship }));
  };

  // Toggle ship orientation
  const toggleOrientation = () => {
    setGameState(prev => ({ 
      ...prev, 
      shipOrientation: prev.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal' 
    }));
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
    }
  };

  // Randomize fleet placement
  const randomizeFleet = () => {
    const newBoard = placeAllShipsRandomly(gameState.playerBoard);
    setGameState(prev => ({
      ...prev,
      playerBoard: newBoard,
      selectedShip: null,
    }));
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
        const { newBoard, newAIState } = aiTakeTurn(gameState.playerBoard, aiState);
        
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
    <div className="min-h-screen bg-gradient-to-b from-steel-950 via-steel-900 to-steel-950 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-steel-50 tracking-wide">
          <span className="text-brass-400">⚓</span> Battleship
        </h1>

        {gameState.phase === 'setup' && (
          <div className="space-y-6">
            {/* Captain hero banner */}
            <div className="relative overflow-hidden rounded-xl shadow-2xl mb-6 h-56 sm:h-72 lg:h-96">
              <img
                src={captainImg}
                alt="The captain on the bridge wing of his battleship, guns firing amid a running sea battle"
                className="absolute inset-0 w-full h-full object-cover object-[center_15%]"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/50 to-transparent" />
              <div className="relative h-full flex flex-col justify-end p-6 sm:p-8 max-w-lg">
                <p className="text-amber-300 text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase mb-1">
                  Captain on deck
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 drop-shadow-lg">
                  Setup Phase
                </h2>
                <p className="text-slate-200 text-sm sm:text-base drop-shadow">
                  "Place your fleet, sailor. The enemy is already at range."
                </p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 justify-center items-start">
              {/* Ship Selector */}
              <ShipSelector
                placedShips={gameState.playerBoard.ships}
                selectedShip={gameState.selectedShip}
                onShipSelect={handleShipSelect}
              />

              {/* Controls */}
              <div className="bg-steel-900/90 border border-steel-700 p-4 rounded-lg shadow-xl space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-brass-300">
                  Controls
                </h3>

                <button
                  onClick={toggleOrientation}
                  className="w-full px-4 py-2 bg-steel-800 border border-steel-700 hover:bg-steel-700 hover:border-steel-600 rounded-md transition-colors text-steel-100"
                >
                  Orientation: {gameState.shipOrientation.toUpperCase()}
                </button>

                <button
                  onClick={randomizeFleet}
                  className="w-full px-4 py-2 bg-steel-700 border border-steel-600 hover:bg-steel-600 hover:border-steel-500 text-steel-50 rounded-md transition-colors"
                >
                  🎲 Randomize Fleet
                </button>

                {allShipsPlaced && (
                  <button
                    onClick={startGame}
                    className="w-full px-4 py-2 bg-brass-500 hover:bg-brass-400 text-steel-950 rounded-md transition-colors font-semibold shadow-lg shadow-brass-500/20"
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
              <div className={`inline-block px-6 py-3 rounded-full text-lg font-semibold border ${
                gameState.currentTurn === 'player'
                  ? 'bg-brass-500/15 border-brass-500/50 text-brass-300'
                  : 'bg-steel-800/80 border-steel-600 text-steel-300 animate-pulse'
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
              {[
                { title: 'Your Fleet', ships: gameState.playerBoard.ships },
                { title: 'Enemy Fleet', ships: gameState.aiBoard.ships },
              ].map(({ title, ships }) => (
                <div key={title} className="bg-steel-900/90 border border-steel-700 p-4 rounded-lg shadow-xl min-w-[11rem]">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-brass-300 mb-2">
                    {title}
                  </h3>
                  <div className="space-y-1">
                    {ships.map(ship => (
                      <div
                        key={ship.id}
                        className={`text-sm ${ship.isSunk ? 'text-ember-500 line-through' : 'text-steel-200'}`}
                      >
                        {ship.name} {ship.isSunk ? '(Sunk)' : `(${ship.hits}/${ship.size})`}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {gameState.phase === 'gameover' && (
          <div className="fixed inset-0 bg-steel-950/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-steel-900 border border-steel-700 p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
              <h2 className={`text-3xl font-bold mb-4 ${
                gameState.winner === 'player' ? 'text-brass-400' : 'text-ember-500'
              }`}>
                {gameState.winner === 'player' ? '🎉 You Win!' : '🤖 AI Wins!'}
              </h2>
              <p className="text-steel-300 mb-6">
                {gameState.winner === 'player'
                  ? 'Congratulations! You sunk all AI ships!'
                  : 'The AI sunk all your ships. Better luck next time!'}
              </p>
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-brass-500 hover:bg-brass-400 text-steel-950 rounded-lg transition-colors font-semibold shadow-lg shadow-brass-500/20"
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