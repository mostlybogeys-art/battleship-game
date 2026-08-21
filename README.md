# ⚓ Battleship Game

A fully functional, web-based Battleship game built with React, TypeScript, Vite, and Tailwind CSS. Play against an intelligent AI opponent in this classic naval combat game.

## 🎮 Features

- **Setup Phase**: Place ships by hand with a live validity preview, or hit Randomize Fleet
- **Combat Phase**: Turn-based gameplay with visual feedback for hits and misses
- **Intelligent AI**: Two-mode firing algorithm (Hunt Mode + Target Mode)
- **Three Difficulty Levels**: Easy, Medium, and Hard, each with a distinct firing strategy
- **Sound Effects**: Explosions, splashes, and win/loss stings, synthesized in-browser with no audio files
- **Original Score**: Procedural minor-key naval hymn for choir, brass and timpani, generated at runtime
- **Animations**: Explosion and splash effects on the last shot, plus screen shake when you take a hit
- **Responsive Design**: Works on desktop and mobile devices
- **Visual Feedback**: Distinct colors and icons for different game states
- **Game Over Modal**: Clear winner declaration with play again functionality

## 🛠️ Tech Stack

- **React 18**: UI library for building the interface
- **TypeScript**: Type-safe JavaScript for better development experience
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Modern JavaScript**: ES6+ features and React hooks

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd battleship-game
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Deployment

This project is ready to be deployed to Vercel, Netlify, or any static hosting service:

- **Vercel**: Connect your GitHub repository and deploy
- **Netlify**: Drag and drop the `dist` folder or connect via Git
- **GitHub Pages**: Use the `dist` folder as the publishing source

## 🎯 Game Rules

### Board Setup
- 10x10 grid (A-J rows, 1-10 columns)
- 5 ships per player:
  - Carrier (5 cells)
  - Battleship (4 cells)
  - Cruiser (3 cells)
  - Submarine (3 cells)
  - Destroyer (2 cells)

### Gameplay
1. **Setup Phase**: Place your ships on the board (horizontal or vertical)
2. **Combat Phase**: Take turns firing at opponent's board
3. **Win Condition**: Sink all opponent's ships first

### Game Controls
- **Setup Phase**:
  - The first ship is pre-selected; pick a different one from the fleet list at any time
  - Hover the grid to preview the placement — brass means legal, red means illegal
  - Press <kbd>R</kbd> (or use the orientation button) to rotate
  - Click the grid to place; the next unplaced ship is selected automatically
  - Click an already-placed ship to lift it back off and move it
  - **Randomize** fills the whole fleet, **Clear** empties the grid
  - Pick a difficulty, then click "Start Game" once all five ships are down

- **Combat Phase**:
  - Click on AI's board to fire
  - Wait for AI to take its turn
  - Game ends when all ships of one fleet are sunk
  - Toggle effects (🔊) and music (♫) next to the title

## 🤖 AI Logic

The AI opponent uses a sophisticated two-mode firing algorithm:

### Hunt Mode
- AI fires at random valid coordinates
- Used when no ships have been recently hit
- Ensures coverage of the entire board over time

### Target Mode
- Activated when AI scores a hit
- Intelligently targets adjacent orthogonal cells (North, South, East, West)
- Continues targeting along a successful direction until the ship is sunk
- Switches direction if initial direction fails
- Returns to Hunt Mode when a ship is completely sunk

### AI Features
- **Memory**: Never fires at the same coordinate twice
- **Smart Targeting**: Prioritizes cells adjacent to known hits
- **Directional Logic**: Tries opposite direction if initial direction fails
- **Ship Tracking**: Knows when a ship is sunk and resets targeting strategy

### Difficulty Levels

Difficulty is selected during the Setup Phase and changes how the AI fires:

| Level | Behaviour |
|---|---|
| **Easy** | Resets to Hunt Mode every turn, so it never follows up on a hit. Shots are effectively blind. |
| **Medium** | Full Hunt/Target algorithm described above. |
| **Hard** | Hunt shots are biased to a checkerboard (`(row + col) % 2 === 0`). Since the smallest ship occupies 2 cells, a checkerboard sweep cannot miss any ship, so it finds the fleet in roughly half the shots. |

## 🔊 Sound & Animation

All audio is synthesized at runtime with the Web Audio API rather than shipped as
audio files. Sound effects and music share a single `AudioContext` (`src/audio.ts`)
— two contexts would drift apart in time, and browsers cap how many a page may
create.

### Sound effects (`src/sound.ts`)

- **Hit**: low-pass filtered noise burst plus a descending sawtooth boom
- **Miss**: high-pass filtered noise burst plus a short sine splash
- **Ship sunk**: longer, louder explosion with a descending siren
- **Win / Lose**: ascending major arpeggio / descending minor run

### Music (`src/music.ts`)

An original procedural score in the vein of a Cold War submarine picture — a slow
minor hymn for male-choir pad, low brass, sub pedal and timpani. It is generated
from scratch, so the entire soundtrack costs about 5KB gzipped and no copyrighted
audio is shipped or streamed.

| Layer | Synthesis |
|---|---|
| Choir | Three detuned sawtooths per voice through a low-pass plus two *peaking formant filters* (720Hz, 1180Hz). The formants are what make it read as an "ahh" vowel rather than a synth buzz. |
| Low brass | Sawtooth pair with a filter that sweeps open then closes across each note; the swelling filter is what sells "brass". |
| Sub pedal | Sine for weight plus a filtered saw for growl. |
| Timpani | Sine dropping 110Hz→46Hz with a short noise thwack. |

Harmonically it is 54 BPM in D aeolian, i–VI–III–VII (Dm–B♭–F–C), on a
35.6-second loop. The flat VI and VII are deliberate — a raised leading tone
would make it sound Western rather than modal. The brass line enters at bar 3 so
the loop opens as atmosphere before stating a theme.

Two details worth knowing before editing it:

- **Notes are scheduled ahead against the audio clock**, not fired from
  `setInterval`. A timer only decides *when to schedule*; the `AudioContext`
  clock decides when notes sound. Without this the music stutters whenever the
  main thread is busy re-rendering the board.
- **Playback starts on entering the Combat Phase**, which is always downstream of
  a click. Browsers keep the `AudioContext` suspended until the page sees a
  gesture, so this satisfies autoplay policy without a separate "enable audio"
  prompt.

Effects and music have independent toggles (🔊 and ♫) next to the title.

### Animations

CSS keyframes defined in `src/index.css`, applied only to the most recent shot so
the rest of the board does not re-animate on every turn:

- `animate-explode` — scale-up pop on a hit
- `animate-splash` — expanding ring on a miss
- `animate-shake` — the player's board shakes when the AI lands a hit
- `animate-pop` — the "ship sunk" banner

## 📁 Project Structure

```
battleship-game/
├── src/
│   ├── components/
│   │   ├── Board.tsx          # Main game board component
│   │   ├── Cell.tsx           # Individual cell component
│   │   └── ShipSelector.tsx   # Ship selection interface
│   ├── aiLogic.ts             # AI opponent logic (hunt/target, difficulty)
│   ├── gameLogic.ts           # Core game mechanics
│   ├── audio.ts               # Shared AudioContext, noise buffers, note→freq
│   ├── sound.ts               # Web Audio API sound effects
│   ├── music.ts               # Procedural background score
│   ├── types.ts               # TypeScript type definitions
│   ├── App.tsx                # Main application component
│   ├── main.tsx               # Application entry point
│   └── index.css              # Tailwind directives + animation keyframes
├── public/                    # Static assets
├── index.html                 # HTML template
├── package.json               # Dependencies
├── tailwind.config.js         # Tailwind configuration
├── tsconfig.json              # TypeScript configuration
└── vite.config.ts             # Vite configuration
```

## 🎨 UI/UX Features

- **Visual States**: 
  - Empty water (blue)
  - Ships (gray with ship icon)
  - Hits (red with explosion icon)
  - Misses (white with dot)

- **Responsive Design**:
  - Side-by-side boards on desktop
  - Stacked boards on mobile
  - Adaptive cell sizes

- **Status Indicators**:
  - Turn indicator (Your Turn / AI is thinking)
  - Ship status panels showing hits and sunk status
  - Game over modal with winner announcement

## 🔧 Configuration

### Tailwind CSS
Configuration is in `tailwind.config.js`. Customize colors, spacing, and other design tokens as needed.

### TypeScript
TypeScript configuration is split across:
- `tsconfig.json` - Root configuration
- `tsconfig.app.json` - Application code
- `tsconfig.node.json` - Build scripts

## 🐛 Troubleshooting

### Port Already in Use
If port 5173 is occupied, Vite will automatically try the next available port (5174, 5175, etc.).

### Build Issues
If you encounter build issues, try:
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

### Styling Issues
If Tailwind CSS styles aren't loading:
1. Ensure `postcss.config.js` is properly configured
2. Check that `index.css` includes the Tailwind directives
3. Clear Vite cache: `rm -rf node_modules/.vite`

## 📝 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## 🎮 Future Enhancements

Potential features for future versions:
- Multiplayer support
- Statistics tracking (win/loss record, accuracy)
- Achievements and win streaks
- Different board sizes
- Special weapons/power-ups
- Music that reacts to the state of the game (intensifying as your fleet is lost)

### Known technical debt
- `noUnusedLocals` / `noUnusedParameters` are currently disabled in
  `tsconfig.app.json`. They were turned off to get an early build green, and that
  masked the accidental deletion of live code. Worth re-enabling.
- There is no test runner. The game logic, AI loop and score have all been
  validated with throwaway scripts; adding Vitest would make those permanent.

---

Enjoy playing Battleship! 🚢⚓