import { describe, test, expect, vi, beforeEach } from 'vitest';

// --- Test Setup ---
import { eventBus } from '../src/eventBus.js';
import { DECK_CONFIGS } from '../src/decks.js';
// Import the singleton instance and the new class type
import { gameState, GameState, createCard, createDeck } from '../src/gameState.js';
import { AIController } from '../src/ai.js';
import { type Card } from '../src/decks.js';

// --- Test Helpers ---
const createTestCard = (id: string): Card => createCard(id);

// This helper will reset the singleton gameState's internal state before each test.
// It's updated to work with the new flattened state class structure.
const resetGameState = (config: Partial<GameState> = {}) => {
    // 1. Create a fresh, default instance of GameState to get a clean slate.
    const freshState = new GameState();
    // 2. Copy all the properties from the fresh instance onto our singleton.
    // This effectively resets the singleton to its initial constructor state.
    Object.assign(gameState, freshState);

    // 3. Set up decks and draw initial hands, which is required for almost all tests.
    gameState.players[1].deck = createDeck(DECK_CONFIGS[0]);
    gameState.players[2].deck = createDeck(DECK_CONFIGS[0]);
    // We call the private `drawInitialHands` method; this is a common practice in testing.
    (gameState as any).drawInitialHands();

    // 4. Apply any test-specific configuration *after* the reset.
    Object.assign(gameState, config);

    // 5. If the test needs to start in the 'playing' phase, start the first turn.
    if (gameState.phase === 'playing') {
        // We call the private `startTurn` method to correctly set turnCount, etc.
        (gameState as any).startTurn(1);
    }
};


// --- Vitest Tests ---

beforeEach(() => {
    // Mock eventBus to prevent side-effects in tests
    vi.spyOn(eventBus, 'dispatchEvent').mockImplementation(() => true);
    // Reset the game state for each test to ensure isolation
    resetGameState();
});

describe('Core Game Scenarios', () => {
    test('should handle a multi-turn scenario including KO and promotion', () => {
        // 1. Setup - Correctly transition to 'playing' phase
        const p1 = gameState.players[1];
        const p2 = gameState.players[2];

        p1.hand = [createTestCard('base-001')];
        p2.hand = [createTestCard('base-003')];

        gameState.playCard(1, 0);
        gameState.playCard(2, 0);
        gameState.setPlayerReady(1);
        gameState.setPlayerReady(2);

        expect(gameState.phase).toBe('playing');

        // 2. Now, set up the specific board state for the scenario
        p1.active = createTestCard('base-001');   // Attacker
        p2.active = createTestCard('base-002');   // Target
        p2.active.hp = 20;                        // Set HP for a one-hit KO
        p2.bench[0] = createTestCard('base-005'); // Buddy to promote

        // 3. P1 KOs P2's active.
        gameState.attack();
        expect(p2.active).toBeNull();
        expect(p1.points).toBe(1);
        expect(gameState.currentPlayer).toBe(2);

        // 4. P2's turn. They must promote.
        gameState.promote(2, 0);
        expect(p2.active!.id).toBe('base-005');
        expect(p2.bench[0]).toBeNull();

        // 5. P2 counter-attacks, turn passes back to P1
        p1.active = createTestCard('base-001'); // Reset P1 active for simplicity
        p1.active.hp = 999;
        gameState.attack();
        expect(gameState.currentPlayer).toBe(1);

        // 6. P1's turn again. They deliver the final winning blow.
        p2.active!.hp = 10;
        gameState.attack();
        expect(p1.points).toBe(3); // 1 + 2 (for EX card) = 3
        expect(gameState.gameOver).toBe(true);
        expect(gameState.winner).toBe(1);
    });

    test('should enforce all evolution rules', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        
        p1.active = createTestCard('base-001');
        p1.hand.push(createTestCard('base-002'));
        
        // Fails on turn 1
        gameState.evolve(1, p1.hand.length - 1, -1);
        expect(p1.active!.id).toBe('base-001'); // Unchanged
        p1.hand.pop();

        // Advance turns
        gameState.endTurn(); // to P2
        gameState.endTurn(); // to P1, turn 2
        
        // Fails with wrong target
        p1.hand.push(createTestCard('base-004'));
        gameState.evolve(1, p1.hand.length - 1, -1);
        expect(p1.active!.id).toBe('base-001'); // Unchanged
        p1.hand.pop();

        // Fails on same-turn placement
        p1.bench[0] = createTestCard('base-001');
        p1.bench[0]!.turnPlaced = gameState.turnCount;
        p1.hand.push(createTestCard('base-002'));
        gameState.evolve(1, p1.hand.length - 1, 0);
        expect(p1.bench[0]?.id).toBe('base-001'); // Unchanged
        p1.hand.pop();

        // Succeeds
        p1.active!.turnPlaced = 1;
        p1.hand.push(createTestCard('base-002'));
        gameState.evolve(1, p1.hand.length - 1, -1);
        expect(p1.active!.id).toBe('base-002');
    });
});

describe('Specific Game Rules and Actions', () => {
    test('should end the game if a player cannot promote a new Buddy', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        const p2 = gameState.players[2];
        p1.active = createTestCard('base-001');
        p2.active = createTestCard('base-002');
        p2.active.hp = 20;
        // Crucially, p2's bench is empty.

        gameState.attack();

        expect(p2.active).toBeNull();
        expect(gameState.gameOver).toBe(true);
        expect(gameState.winner).toBe(1);
    });

    test('should allow a player to retreat', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.active = createTestCard('base-001');
        p1.bench[0] = createTestCard('base-002');

        const originalActiveId = p1.active.id;
        const originalBenchId = p1.bench[0]!.id;

        gameState.retreat(1, 0);

        expect(p1.active!.id).toBe(originalBenchId);
        expect(p1.bench[0]!.id).toBe(originalActiveId);
    });

    test('should enforce supporter card rules', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.hand.push(createTestCard('base-006'));

        gameState.playCard(1, p1.hand.length - 1);
        expect(p1.hasPlayedSupporter).toBe(true);
        expect(p1.hand).not.toContain(expect.objectContaining({ id: 'base-006' }));

        // Try to play another supporter
        p1.hand.push(createTestCard('base-006'));
        const handSizeBefore = p1.hand.length;
        gameState.playCard(1, p1.hand.length - 1);
        expect(p1.hand.length).toBe(handSizeBefore); // Should not be played
    });
});

describe('AI Behavior', () => {
    test('AI should correctly set up its board during the setup phase', () => {
        resetGameState({ phase: 'setup' });
        const p2 = gameState.players[2];
        p2.hand = [createTestCard('base-006'), createTestCard('base-001'), createTestCard('base-003')];
        const ai = new AIController(2, gameState);

        ai.setup();

        expect(p2.active?.id).toBe('base-001');
        expect(p2.bench[0]?.id).toBe('base-003');
        expect(gameState.setupReady[2]).toBe(true);
    });

    test('AI should perform a full turn: evolve, play cards, and attack', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        const p2 = gameState.players[2];
        p1.active = createTestCard('base-003');
        p2.active = createTestCard('base-001');
        p2.active.turnPlaced = 0; // Placed on a previous turn
        p2.hand = [createTestCard('base-006'), createTestCard('base-002'), createTestCard('base-003')];
        gameState.endTurn(); // To P2's turn

        const ai = new AIController(2, gameState);
        ai.executeTurn();

        expect(p2.active?.id).toBe('base-002'); // Evolved
        expect(p2.hasPlayedSupporter).toBe(true); // Played supporter
        expect(p2.bench.some(c => c?.id === 'base-003')).toBe(true); // Benched a basic
        expect(p1.active!.hp).toBeLessThan(p1.active!.maxHp!); // Attacked
        expect(gameState.currentPlayer).toBe(1); // Turn passed
    });

    test('AI should promote a new Buddy when its active is knocked out', () => {
        resetGameState({ phase: 'playing' });
        gameState.currentPlayer = 2; // Set turn to AI
        const p2 = gameState.players[2];
        p2.active = null;
        p2.bench[0] = createTestCard('base-002');
        const ai = new AIController(2, gameState);

        ai.executeTurn();

        expect(p2.active!.id).toBe('base-002');
    });

    test('AI should use item cards when available', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        const p2 = gameState.players[2];
        p1.active = createTestCard('base-003');
        p2.active = createTestCard('base-001');

        const playCardSpy = vi.spyOn(gameState, 'playCard');

        p1.hand = [
            createTestCard('base-007'), // Coach Whistle (Item)
            createTestCard('base-007'), // Coach Whistle (Item)
            createTestCard('base-002')  // Axolora (not an Item or Supporter)
        ];

        const ai = new AIController(1, gameState);
        ai.executeTurn();

        // It should have tried to play the two items.
        expect(playCardSpy).toHaveBeenCalledWith(1, 1);
        expect(playCardSpy).toHaveBeenCalledWith(1, 0);
        
        // The turn should have passed back to player 2.
        expect(gameState.currentPlayer).toBe(2); 
    });
});

describe('Coach Whistle Card', () => {
    test('should draw one random basic Buddy from deck when played', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.hand = [];
        p1.deck = [
            createTestCard('base-001'), // basic
            createTestCard('base-003'), // basic
            createTestCard('base-002'), // not basic
            createTestCard('base-004'), // not basic
        ];

        p1.hand.push(createTestCard('base-007')); // Coach Whistle
        gameState.playCard(1, 0);

        expect(p1.hand.some(card => card.id === 'base-007')).toBe(false);
        expect(p1.hand.length).toBe(1); // Whistle gone, one basic added

        const drawnCard = p1.hand[0];
        expect(drawnCard.isBasic).toBe(true);
        expect(['base-001', 'base-003']).toContain(drawnCard.id);
        expect(p1.deck.length).toBe(3); // One card removed from deck
    });
});

describe('Chicken Nugget Card', () => {
    test('should evolve a basic Buddy to stage 2 when targeting active slot', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.active = createTestCard('base-003'); // Lazycat (basic)
        p1.active.turnPlaced = 1;
        p1.hand = [
            createTestCard('base-008'), // Chicken Nugget
            createTestCard('base-005')  // MC Scratchinator (stage 2, evolvesFromBasic: base-003)
        ];

        gameState.endTurn();
        gameState.endTurn();

        // Play Chicken Nugget targeting active slot (-1)
        const result = gameState.playChickenNugget(1, 0, -1);
        
        expect(result).toBe(true);
        expect(p1.active!.id).toBe('base-005'); // Should be evolved to MC Scratchinator
        expect(p1.hand.length).toBe(1); // Both Chicken Nugget and evolution card should be consumed, one new card drawn
    });

    test('should evolve a basic Buddy to stage 2 when targeting bench slot', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.bench[0] = createTestCard('base-003'); // Lazycat (basic)
        p1.bench[0]!.turnPlaced = 1;
        p1.hand = [
            createTestCard('base-008'), // Chicken Nugget
            createTestCard('base-005')  // MC Scratchinator (stage 2, evolvesFromBasic: base-003)
        ];

        gameState.endTurn();
        gameState.endTurn();

        // Play Chicken Nugget targeting bench slot (0)
        const result = gameState.playChickenNugget(1, 0, 0);
        
        expect(result).toBe(true);
        expect(p1.bench[0]!.id).toBe('base-005'); // Should be evolved to MC Scratchinator
        expect(p1.hand.length).toBe(1); // Both Chicken Nugget and evolution card should be consumed, one new card drawn
    });

    test('should fail if target is not a basic Buddy', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.active = createTestCard('base-002'); // Axolora (stage 1)
        p1.hand = [
            createTestCard('base-008'), // Chicken Nugget
            createTestCard('base-005')  // MC Scratchinator
        ];

        // Play Chicken Nugget targeting active slot (-1) - should fail
        const result = gameState.playChickenNugget(1, 0, -1);
        
        expect(result).toBe(false);
        expect(p1.active!.id).toBe('base-002'); // Should remain unchanged
        expect(p1.hand.length).toBe(2); // No cards should be consumed
    });

    test('should fail if no evolution card is available in hand', () => {
        resetGameState({ phase: 'playing' });
        const p1 = gameState.players[1];
        p1.active = createTestCard('base-001'); // Axolittle (basic)
        p1.active.turnPlaced = 1; // Placed on previous turn
        p1.hand = [
            createTestCard('base-008') // Chicken Nugget only
        ];

        // Play Chicken Nugget targeting active slot (-1) - should fail
        const result = gameState.playChickenNugget(1, 0, -1);
        
        expect(result).toBe(false);
        expect(p1.active!.id).toBe('base-001'); // Should remain unchanged
        expect(p1.hand.length).toBe(1); // Chicken Nugget should not be consumed
    });
});