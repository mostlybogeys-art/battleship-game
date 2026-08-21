import { useState, useEffect } from 'react';
import { Board } from './components/Board';
import { ShipSelector } from './components/ShipSelector';
import { 
  GameState, 
  Ship,
  Position,
  Difficulty
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
import { soundManager } from './sound';
import captainImg from './assets/captain.jpg';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy - Random Rookie',
  medium: 'Medium - Hunt Captain',
  hard: 'Hard - Battleship Admiral'
};

function App() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    phase: 'setup',
    playerBoard: createEmptyBoard(),
    aiBoard: createEmptyBoard(),
    currentTurn: 'player',
    selectedShip: null,
    shipOrientation: 'horizontal',
    winner: null,
    difficulty: 'medium',
  }));

  const [aiState, setAIState] = useState(createInitialAIState());
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [lastPlayerShot, setLastPlayerShot] = useState<Position | null>(null);
  const [lastAIShot, setLastAIShot] = useState<Position | null>(null);
  const [boardShake, setBoardShake] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [sunkShipName, setSunkShipName] = useState<string | null>(null);

  const setSound = (enabled: boolean) => {
    setSfxEnabled(enabled);
    soundManager.setEnabled(enabled);
  };

  // Reset game
  const resetGame = () => {
    setGameState(prev => ({
      phase: 'setup',
      playerBoard: createEmptyBoard(),
      aiBoard: createEmptyBoard(),
      currentTurn: 'player',
      selectedShip: null,
      shipOrientation: 'horizontal',
      winner: null,
      difficulty: prev.difficulty,
    }));
    setAIState(createInitialAIState());
    setIsAIThinking(false);
    setLastPlayerShot(null);
    setLastAIShot(null);
    setBoardShake(false);
    setSunkShipName(null);
    soundManager.playClick();
  };

  // Handle difficulty change
  const setDifficulty = (difficulty: Difficulty) => {
    setGameState(prev => ({ ...prev, difficulty }));
    soundManager.playClick();
  };

  // Handle ship selection in setup phase
  const handleShipSelect = (ship: Ship) => {
    setGameState(prev => ({ ...prev, selectedShip: ship }));
    soundManager.playClick();
  };

  // Toggle ship orientation
  const toggleOrientation = () => {
    setGameState(prev => ({ 
      ...prev, 
      shipOrientation: prev.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal' 
    }));
    soundManager.playClick();
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
      soundManager.playClick();
    }
  };

  // Randomize fleet placement
  const randomizeFleet = () => {
    const newBoard = placeAllShipsRandomly();
    setGameState(prev => ({
      ...prev,
      playerBoard: newBoard,
      selectedShip: null,
    }));
    soundManager.playClick();
  };

  // Start game (transition to combat phase)
  const startGame = () => {
    if (gameState.playerBoard.ships.length !== 5) return;

    const aiBoard = placeAllShipsRandomly();
    
    setGameState(prev => ({
      ...prev,
      phase: 'combat',
      aiBoard,
      currentTurn: 'player',
    }));
    soundManager.playClick();
  };

  // Handle player attack in combat phase
  const handlePlayerAttack = (row: number, col: number) => {
    if (gameState.currentTurn !== 'player' || gameState.phase !== 'combat') return;
    if (!isValidAttack(gameState.aiBoard, row, col)) return;

    setLastPlayerShot({ row, col });
    const { board: newAIBoard, hit, sunkShip } = performAttack(gameState.aiBoard, row, col);

    setSunkShipName(sunkShip);
    if (hit) {
      soundManager.playHit();
      if (sunkShip) soundManager.playSunk();
    } else {
      soundManager.playMiss();
    }
    
    const playerWon = areAllShipsSunk(newAIBoard);

    setGameState(prev => ({
      ...prev,
      aiBoard: newAIBoard,
      currentTurn: playerWon ? prev.currentTurn : 'ai',
      phase: playerWon ? 'gameover' : prev.phase,
      winner: playerWon ? 'player' : prev.winner,
    }));

    if (playerWon) soundManager.playWin();
  };

  // AI turn effect
  useEffect(() => {
    if (gameState.currentTurn === 'ai' && gameState.phase === 'combat' && !isAIThinking) {
      setIsAIThinking(true);
      setSunkShipName(null);
      
      const thinkingTime = Math.random() * 1000 + 500; // 500-1500ms
      
      const timer = setTimeout(() => {
        const { newBoard, newAIState, shot, sunkShip } = aiTakeTurn(
          gameState.playerBoard,
          aiState,
          gameState.difficulty
        );

        setLastAIShot(shot);
        setSunkShipName(sunkShip);

        const hit = newBoard.cells[shot.row][shot.col].state === 'hit';
        if (hit) {
          soundManager.playHit();
          if (sunkShip) soundManager.playSunk();
          setBoardShake(true);
          setTimeout(() => setBoardShake(false), 300);
        } else {
          soundManager.playMiss();
        }

        const aiWon = areAllShipsSunk(newBoard);

        setGameState(prev => ({
          ...prev,
          playerBoard: newBoard,
          currentTurn: 'player',
          phase: aiWon ? 'gameover' : prev.phase,
          winner: aiWon ? 'ai' : prev.winner,
        }));

        setAIState(newAIState);
        setIsAIThinking(false);

        if (aiWon) soundManager.playLose();
      }, thinkingTime);

      return () => clearTimeout(timer);
    }
  }, [gameState.currentTurn, gameState.phase, gameState.difficulty, aiState, isAIThinking, gameState.playerBoard]);

  const allShipsPlaced = gameState.playerBoard.ships.length === 5;

  return (
    <div className="min-h-screen bg-gradient-to-b from-steel-950 via-steel-900 to-steel-950 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-4 mb-8">
          <h1 className="text-4xl font-bold text-steel-50 tracking-wide">
            <span className="text-brass-400">⚓</span> Battleship
          </h1>
          <button
            onClick={() => setSound(!sfxEnabled)}
            aria-label={sfxEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              sfxEnabled
                ? 'bg-brass-500/15 border-brass-500/50 text-brass-300'
                : 'bg-steel-800 border-steel-700 text-steel-400'
            }`}
          >
            {sfxEnabled ? '🔊' : '🔇'}
          </button>
        </div>

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

                {/* Difficulty selector */}
                <div className="space-y-2">
                  <label className="text-xs text-steel-400 uppercase tracking-wider">Difficulty</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map(diff => (
                      <button
                        key={diff}
                        onClick={() => setDifficulty(diff)}
                        className={`px-2 py-2 text-xs rounded border transition-colors ${
                          gameState.difficulty === diff
                            ? 'bg-brass-500 border-brass-400 text-steel-950 font-semibold'
                            : 'bg-steel-800 border-steel-700 hover:bg-steel-700 text-steel-200'
                        }`}
                      >
                        {diff.charAt(0).toUpperCase() + diff.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

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
            {/* Difficulty badge */}
            <div className="text-center">
              <span className="text-steel-400 text-sm">
                Admiral: <span className="text-brass-300">{DIFFICULTY_LABELS[gameState.difficulty]}</span>
              </span>
            </div>

            {/* Sunk ship notification */}
            {sunkShipName && (
              <div className="text-center">
                <div className="inline-block px-6 py-2 bg-ember-600/20 border border-ember-500/50 text-ember-300 rounded-full animate-pop font-semibold">
                  💥 {sunkShipName} sunk!
                </div>
              </div>
            )}

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
                lastShot={lastAIShot}
                shake={boardShake}
              />

              <Board
                board={gameState.aiBoard}
                onCellClick={handlePlayerAttack}
                showShips={false}
                disabled={gameState.currentTurn !== 'player'}
                label="AI Board (Click to Attack)"
                lastShot={lastPlayerShot}
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