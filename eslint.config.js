const globals = require("globals");

module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module", // <-- THE FIX IS HERE
      globals: {
        ...globals.browser,
        ...globals.node,
        // Expose window globals for browser environment
        // NOTE: Since you are using globals.d.ts and @ts-check,
        // you can safely remove many of these explicit globals later
        // if you wish, as the type checker is now aware of them.
        window: "readonly",
        gameState: "writable",
        createDeck: "readonly",
        shuffleDeck: "readonly",
        createCard: "readonly",
        initGame: "readonly",
        setPlayerReady: "readonly",
        startGame: "readonly",
        startTurn: "readonly",
        attachEnergy: "readonly",
        retreat: "readonly",
        playBuddy: "readonly",
        promoteBuddy: "readonly",
        attack: "readonly",
        endTurn: "readonly",
        endGame: "readonly",
        displayWinMessage: "readonly",
        updateDisplay: "readonly",
        createCardElement: "readonly"
      }
    },
    rules: {
      // Add any specific rules here
    }
  }
];