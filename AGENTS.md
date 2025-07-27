## AGENTS.md

This document outlines guidelines for agentic coding agents working in this repository.

### Project Overview
This is a hobby project, a heavily simplified TCG. The goal is to create a minimum viable "playground" to experiment with deck archetypes and AI, while keeping it possible to playtest in GUI.

### File Structure
- `index.html`: Main entry point, contains game UI structure
- `style.css`: All game styling and layout
- `gameState.js`: Manages all core game rules and state
- `gameLogic.js`: Utility functions for game setup (deck creation, card instantiation)
- `ui.js`: Handles DOM manipulation and user interactions
- `eventBus.js`: Pub/sub system for decoupled component communication
- `ai.js`: AI opponent controller and decision logic  
- `tournament.js`: Automated match runner with statistics collection
- `decks.js`: Preconfigured deck lists, and card attributes
- `manifest.json`: PWA installation configuration
- `sw.js`: Service worker for offline capabilities
- `test.js`: Unit tests for game logic

### Core Components
1. **Game State** (managed in gameState.js):
   - Player decks
   - Active cards
   - Turn management
   - Win/lose conditions
   - All game logic methods (e.g., `attachEnergy`, `playCard`, `attack`, `endTurn`).

2. **UI Layer** (ui.js):
    - Card rendering
    - Event handlers
    - Game board updates

3. **Event System** (eventBus.js):
    - Pub/sub pattern implementation
    - Handles cross-component notifications
    - Methods: `on()`, `emit()`, `off()`

4. **AI System** (ai.js):
    - Decision trees for gameplay actions
    - Setup and turn execution logic
    - Configurable difficulty levels (future)

5. **Tournament System** (tournament.js):
    - Batch match execution (1000+ games)
    - Statistical analysis and reporting
    - JSON report generation

### Key Functions
- `initGame()`: (in `gameLogic.js`) Sets up initial game state.
- `window.gameState.setPlayerReady()`: Handles player readiness during setup.
- `window.gameState.startTurn()`: Handles turn progression, card drawing, and energy gain.
- `window.gameState.attachEnergy()`: Attaches energy to a Buddy.
- `window.gameState.retreat()`: Retreats active Buddy with bench Buddy.
- `window.gameState.playCard()`: Moves a card from hand to an empty bench slot.
- `window.gameState.promoteCard()`: Promotes a Buddy from bench to active.
- `window.gameState.attack()`: Deals damage and handles knockouts.
- `window.gameState.endTurn()`: Ends the current player's turn.
- `window.gameState.endGame()`: Correctly identifies a winner and sets the game over state.

### Game Rules
- Each player starts with a 20-card deck
- Players take turns drawing and playing cards
- Basic Buddy TCG Pocket rules apply (simplified)
- First to take all prize cards wins
- See rules/pocket-rules.md for details (most not implemented yet)

### Project direction / roadmap (what to expect in future)
- Implement minimum of the currently missing features for a satisfying game
- Build a nice useful tournament statistics / report system
- Build an agentic AI workflow to plan and run experiments to make the game interesting with minimum assets

### Build/Lint/Test Commands
* **Build**: This project is a simple HTML/CSS/JS application and does not require a formal build step.
* **Lint**: Run `npm run lint` to check code style and potential errors using ESLint.
* **Test**: Unit tests for game logic are located in `test.js` and can be run in the terminal using `npm test` or `node runTests.js` (requires `jsdom`).
* **Tournament**: Run `node tournament.js` for the special tournament mode.

### Code Style Guidelines
* **Imports**: Use standard ES5/ES6 module patterns for JavaScript. For HTML, use `<script src="..."></script>`.
* **Formatting**: Adhere to consistent indentation (2 spaces) and spacing.
* **Types**: Not applicable for this project (plain JavaScript).
* **Naming Conventions**: Use `kebab-case` for CSS class names and file names. Use `camelCase` for JavaScript variables and functions.
* **Error Handling**: Basic error handling via `alert()` or `console.error()` for user-facing issues. Game logic errors should be handled internally to maintain state integrity.

### Workflow
- Be sure to run lint and tests when you’re done making a series of code changes. Whenever you make a short-term plan or TODO list, make sure to include the steps to add tests if necessary, and run lint and test.
