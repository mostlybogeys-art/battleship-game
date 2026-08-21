import { useState, useEffect, useRef } from 'react';
import { Board } from './components/Board';
import { ShipSelector } from './components/ShipSelector';
import { 
  GameState, 
  Ship,
  Position,
  Difficulty,
  SHIP_CONFIGS
} from './types';
import { 
  createEmptyBoard, 
  createShip, 
  getShipPositions, 
  isValidPlacement, 
  placeShipOnBoard, 
  removeShipFromBoard,
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
import { musicEngine } from './music';
import { voiceManager } from './voice';
import captainImg from './assets/captain.jpg';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy - Random Rookie',
  medium: 'Medium - Hunt Captain',
  hard: 'Hard - Battleship Admiral'
};

// Long enough that the turn change reads as deliberate, short enough that it
// never feels like waiting. The jitter keeps it from feeling mechanical.
const AI_THINK_MIN_MS = 280;
const AI_THINK_JITTER_MS = 220;

const firstShip = (): Ship => ({
  ...SHIP_CONFIGS[0],
  positions: [],
  hits: 0,
  isSunk: false,
});

function App() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    phase: 'setup',
    playerBoard: createEmptyBoard(),
    aiBoard: createEmptyBoard(),
    currentTurn: 'player',
    // Pre-selected so the grid is immediately clickable — otherwise the first
    // click on the board silently does nothing and manual placement looks broken.
    selectedShip: firstShip(),
    shipOrientation: 'horizontal',
    winner: null,
    difficulty: 'medium',
  }));

  const [aiState, setAIState] = useState(createInitialAIState());
  // A ref, not state: this only guards against scheduling two AI turns at once
  // and is never rendered. As state it would be an effect dependency, so
  // setting it would re-run the effect and the cleanup would cancel the
  // pending turn before it fired.
  const aiTurnScheduled = useRef(false);
  const [lastPlayerShot, setLastPlayerShot] = useState<Position | null>(null);
  const [lastAIShot, setLastAIShot] = useState<Position | null>(null);
  const [boardShake, setBoardShake] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [sunkShipName, setSunkShipName] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<Position | null>(null);
  const [callout, setCallout] = useState<string | null>(null);

  const setSound = (enabled: boolean) => {
    setSfxEnabled(enabled);
    soundManager.setEnabled(enabled);
  };

  const toggleMusic = () => {
    setMusicEnabled(prev => !prev);
    soundManager.playClick();
  };

  const toggleVoice = () => {
    setVoiceEnabled(prev => {
      voiceManager.setEnabled(!prev);
      return !prev;
    });
    soundManager.playClick();
  };

  // Let spoken lines duck the score so they stay intelligible over the choir.
  useEffect(() => {
    voiceManager.onSpeaking(active => musicEngine.duck(active));
  }, []);

  // Decode the callouts when combat starts, so the first hit does not wait on a
  // fetch. Deliberately not on mount: decodeAudioData needs the AudioContext,
  // which stays suspended until the page has seen a gesture.
  useEffect(() => {
    if (gameState.phase === 'combat') void voiceManager.preload();
  }, [gameState.phase]);

  // The score plays only during combat. Starting it here rather than on mount
  // matters: the AudioContext is suspended until the page sees a gesture, and
  // reaching combat always requires a click.
  useEffect(() => {
    if (gameState.phase === 'combat' && musicEnabled) {
      musicEngine.start();
    } else {
      musicEngine.stop();
    }
  }, [gameState.phase, musicEnabled]);

  // Belt and braces: kill the scheduler and silence any line still being read.
  useEffect(() => () => {
    musicEngine.stop();
    voiceManager.cancel();
  }, []);

  // Reset game
  const resetGame = () => {
    setGameState(prev => ({
      phase: 'setup',
      playerBoard: createEmptyBoard(),
      aiBoard: createEmptyBoard(),
      currentTurn: 'player',
      selectedShip: firstShip(),
      shipOrientation: 'horizontal',
      winner: null,
      difficulty: prev.difficulty,
    }));
    setAIState(createInitialAIState());
    aiTurnScheduled.current = false;
    setHoverCell(null);
    setLastPlayerShot(null);
    setLastAIShot(null);
    setBoardShake(false);
    setSunkShipName(null);
    setCallout(null);
    voiceManager.reset();
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

  // Lift a placed ship back off the grid and hold it ready to re-place.
  const handleShipRemove = (shipId: string) => {
    const config = SHIP_CONFIGS.find(c => c.id === shipId);
    setGameState(prev => ({
      ...prev,
      playerBoard: removeShipFromBoard(prev.playerBoard, shipId),
      selectedShip: config ? { ...config, positions: [], hits: 0, isSunk: false } : prev.selectedShip,
    }));
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

  // The next ship still waiting to be placed, so placing one rolls straight
  // into the next without a trip back to the fleet list.
  const nextUnplacedShip = (board: GameState['playerBoard'], justPlacedId: string): Ship | null => {
    const config = SHIP_CONFIGS.find(
      c => c.id !== justPlacedId && !board.ships.some(s => s.id === c.id)
    );
    return config ? { ...config, positions: [], hits: 0, isSunk: false } : null;
  };

  // Handle cell click in setup phase
  const handleSetupCellClick = (row: number, col: number) => {
    const { selectedShip, playerBoard, shipOrientation } = gameState;

    // Clicking an already-placed ship picks it back up.
    if (!selectedShip) {
      const shipId = playerBoard.cells[row][col].shipId;
      if (shipId) handleShipRemove(shipId);
      return;
    }

    const positions = getShipPositions(row, col, selectedShip.size, shipOrientation);

    if (!isValidPlacement(playerBoard, positions)) return;

    const newShip = createShip(selectedShip, positions);
    const newBoard = placeShipOnBoard(playerBoard, newShip);

    setGameState(prev => ({
      ...prev,
      playerBoard: newBoard,
      selectedShip: nextUnplacedShip(newBoard, selectedShip.id),
    }));
    soundManager.playClick();
  };

  // Randomize fleet placement
  const randomizeFleet = () => {
    const newBoard = placeAllShipsRandomly();
    setGameState(prev => ({
      ...prev,
      playerBoard: newBoard,
      selectedShip: null,
    }));
    setHoverCell(null);
    soundManager.playClick();
  };

  // Clear the grid and start placing from the first ship again.
  const clearFleet = () => {
    setGameState(prev => ({
      ...prev,
      playerBoard: createEmptyBoard(),
      selectedShip: firstShip(),
    }));
    setHoverCell(null);
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
      selectedShip: null,
    }));
    setHoverCell(null);
    soundManager.playClick();
  };

  // R rotates the held ship — faster than reaching for the button mid-placement.
  useEffect(() => {
    if (gameState.phase !== 'setup') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') toggleOrientation();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState.phase]);

  // Handle player attack in combat phase
  const handlePlayerAttack = (row: number, col: number) => {
    if (gameState.currentTurn !== 'player' || gameState.phase !== 'combat') return;
    if (!isValidAttack(gameState.aiBoard, row, col)) return;

    setLastPlayerShot({ row, col });
    const { board: newAIBoard, hit, sunkShip } = performAttack(gameState.aiBoard, row, col);

    setSunkShipName(sunkShip);

    const playerWon = areAllShipsSunk(newAIBoard);

    if (hit) {
      soundManager.playHit();
      if (sunkShip) soundManager.playSunk();
      // Suppress the callout on the killing blow — the victory sting and the
      // game-over modal should not compete with the officer still talking.
      if (!playerWon) setCallout(voiceManager.speakHitCallout());
    } else {
      soundManager.playMiss();
    }

    setGameState(prev => ({
      ...prev,
      aiBoard: newAIBoard,
      currentTurn: playerWon ? prev.currentTurn : 'ai',
      phase: playerWon ? 'gameover' : prev.phase,
      winner: playerWon ? 'player' : prev.winner,
    }));

    if (playerWon) {
      voiceManager.cancel();
      soundManager.playWin();
    }
  };

  // AI turn effect
  useEffect(() => {
    if (gameState.currentTurn !== 'ai' || gameState.phase !== 'combat') return;
    if (aiTurnScheduled.current) return;

    aiTurnScheduled.current = true;
    setSunkShipName(null);
    setCallout(null);

    const thinkingTime = AI_THINK_MIN_MS + Math.random() * AI_THINK_JITTER_MS;

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
      aiTurnScheduled.current = false;

      if (aiWon) soundManager.playLose();
    }, thinkingTime);

    return () => {
      clearTimeout(timer);
      aiTurnScheduled.current = false;
    };
  }, [gameState.currentTurn, gameState.phase, gameState.difficulty, aiState, gameState.playerBoard]);

  const allShipsPlaced = gameState.playerBoard.ships.length === SHIP_CONFIGS.length;

  // Ghost outline of where the held ship would land. Cells that fall off the
  // grid are dropped from the preview, but the placement is still flagged
  // invalid so the player sees red rather than a silently truncated ship.
  const previewPositions =
    gameState.phase === 'setup' && gameState.selectedShip && hoverCell
      ? getShipPositions(
          hoverCell.row,
          hoverCell.col,
          gameState.selectedShip.size,
          gameState.shipOrientation
        )
      : [];

  const previewValid =
    previewPositions.length > 0 &&
    isValidPlacement(gameState.playerBoard, previewPositions);

  const onGrid = previewPositions.filter(
    p => p.row >= 0 && p.row < 10 && p.col >= 0 && p.col < 10
  );

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
            title={sfxEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              sfxEnabled
                ? 'bg-brass-500/15 border-brass-500/50 text-brass-300'
                : 'bg-steel-800 border-steel-700 text-steel-400'
            }`}
          >
            {sfxEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={toggleMusic}
            aria-label={musicEnabled ? 'Turn off music' : 'Turn on music'}
            title={musicEnabled ? 'Turn off music' : 'Turn on music'}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              musicEnabled
                ? 'bg-brass-500/15 border-brass-500/50 text-brass-300'
                : 'bg-steel-800 border-steel-700 text-steel-400'
            }`}
          >
            <span className={musicEnabled ? '' : 'line-through decoration-2'}>♫</span>
          </button>
          <button
            onClick={toggleVoice}
            aria-label={voiceEnabled ? 'Turn off spoken callouts' : 'Turn on spoken callouts'}
            title={voiceEnabled ? 'Turn off spoken callouts' : 'Turn on spoken callouts'}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              voiceEnabled
                ? 'bg-brass-500/15 border-brass-500/50 text-brass-300'
                : 'bg-steel-800 border-steel-700 text-steel-400'
            }`}
          >
            <span className={voiceEnabled ? '' : 'line-through decoration-2'}>🎙</span>
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
                <p className="text-slate-300 text-xs sm:text-sm mt-2 drop-shadow">
                  Pick a ship, press <kbd className="px-1 py-0.5 bg-slate-800/80 rounded border border-slate-600">R</kbd> to rotate,
                  then click the grid. Click a placed ship to move it — or hit Random.
                </p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 justify-center items-start">
              {/* Ship Selector */}
              <ShipSelector
                placedShips={gameState.playerBoard.ships}
                selectedShip={gameState.selectedShip}
                onShipSelect={handleShipSelect}
                onShipRemove={handleShipRemove}
              />

              {/* Controls */}
              <div className="bg-steel-900/90 border border-steel-700 p-4 rounded-lg shadow-xl space-y-4 min-w-[15rem]">
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
                  ⟳ {gameState.shipOrientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
                  <span className="text-xs text-steel-400 ml-1">(R)</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={randomizeFleet}
                    className="px-3 py-2 text-sm bg-steel-700 border border-steel-600 hover:bg-steel-600 hover:border-steel-500 text-steel-50 rounded-md transition-colors"
                  >
                    🎲 Random
                  </button>
                  <button
                    onClick={clearFleet}
                    disabled={gameState.playerBoard.ships.length === 0}
                    className="px-3 py-2 text-sm bg-steel-800 border border-steel-700 hover:bg-steel-700 text-steel-200 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ↺ Clear
                  </button>
                </div>

                {allShipsPlaced ? (
                  <button
                    onClick={startGame}
                    className="w-full px-4 py-2 bg-brass-500 hover:bg-brass-400 text-steel-950 rounded-md transition-colors font-semibold shadow-lg shadow-brass-500/20"
                  >
                    🚀 Start Game
                  </button>
                ) : (
                  <p className="text-xs text-steel-400 text-center pt-1">
                    {SHIP_CONFIGS.length - gameState.playerBoard.ships.length} ship
                    {SHIP_CONFIGS.length - gameState.playerBoard.ships.length === 1 ? '' : 's'} left to place
                  </p>
                )}
              </div>

              {/* Board */}
              <div className="flex-1">
                <Board
                  board={gameState.playerBoard}
                  onCellClick={handleSetupCellClick}
                  onCellHover={(row, col) => setHoverCell({ row, col })}
                  onLeave={() => setHoverCell(null)}
                  showShips={true}
                  disabled={false}
                  label="Your Board"
                  previewPositions={onGrid}
                  previewState={previewValid ? 'valid' : 'invalid'}
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

            {/* Subtitle for the spoken callout. Also carries the line on
                platforms with no speech engine, and for anyone playing muted. */}
            {callout && (
              <div className="text-center" aria-live="polite">
                <p className="inline-block max-w-xl px-5 py-2 bg-steel-900/80 border border-steel-700 rounded-lg text-steel-200 italic animate-pop">
                  <span className="text-brass-400 not-italic mr-2">🎙</span>
                  &ldquo;{callout}&rdquo;
                </p>
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