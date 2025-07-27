// test/ui.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Import types for state creation
import type { GameState, PlayerId } from '../src/gameState';
import type { Card } from '../src/decks';

// Mock dependencies BEFORE they are imported by ui.ts
vi.mock('../src/ai.js', () => ({
  AIController: class {
    setup = vi.fn();
    executeTurn = vi.fn();
  },
}));

// We need access to the singleton for spying
import { gameState } from '../src/gameState';
// eventBus is used to trigger UI updates
import { eventBus } from '../src/eventBus';
// The module to test
import * as ui from '../src/ui';


// --- Test Setup ---

// Load the HTML file's content once to be used in JSDOM
const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');

// A helper to create a default game state for tests, reducing boilerplate
const createTestGameState = (overrides: Partial<GameState> = {}): GameState => {
  const defaultState = {
    players: {
      1: { deck: [], hand: [], active: null, bench: [null, null, null], points: 0, hasPlayedSupporter: false },
      2: { deck: [], hand: [], active: null, bench: [null, null, null], points: 0, hasPlayedSupporter: false },
    },
    currentPlayer: 1,
    phase: 'playing',
    turnCount: 2, // Default to > 1 to allow evolutions etc.
    setupReady: { 1: true, 2: true },
    gameOver: false,
    ...overrides,
  };
  return defaultState as GameState;
};


describe('Game UI Tests', () => {
  // --- Test Environment Setup ---
  beforeEach(() => {
    // Set up a JSDOM environment
    const dom = new JSDOM(html, { url: 'http://localhost' });
    global.document = dom.window.document;
    global.window = dom.window as any;
    global.CustomEvent = dom.window.CustomEvent;

    // FIX: A more robust mock for PointerEvent that respects the init dictionary.
    global.PointerEvent = class MockPointerEvent extends Event {
        button: number;
        constructor(type: string, eventInitDict?: PointerEventInit) {
            // Pass the whole dictionary to the super constructor so it can
            // process properties like `bubbles`.
            super(type, eventInitDict);
            // Manually set the `button` property, which is not on the base `Event`.
            this.button = eventInitDict?.button ?? 0;
        }
    } as any;
    
    // Mock the Web Animations API, which also doesn't exist in JSDOM.
    if (!window.HTMLElement.prototype.animate) {
        window.HTMLElement.prototype.animate = vi.fn().mockImplementation(() => ({
            onfinish: null,
            cancel: vi.fn(),
        }));
    }

    vi.useFakeTimers();
    vi.spyOn(gameState, 'initializeGame').mockImplementation(() => {});
    ui.init();
    vi.spyOn(gameState, 'playCard');
    vi.spyOn(gameState, 'attack');
    vi.spyOn(gameState, 'promote');
    vi.spyOn(gameState, 'retreat');
    vi.spyOn(gameState, 'evolve');
    vi.spyOn(gameState, 'endTurn');
    vi.spyOn(gameState, 'setPlayerReady');
  });
  
  afterEach(() => {
    // Restore real timers and mocks after each test to ensure isolation
    vi.useRealTimers();
    vi.restoreAllMocks();
  });


  // --- Test Suites ---

  describe('UI State & Rendering', () => {
    it('should correctly render the initial board on "gameInitialized"', () => {
      // ARRANGE: A specific game state
      const initialState = createTestGameState({
        players: {
          1: { deck: [], hand: [{ id: 'p001', uid: 'card-1', name: 'Test Card 1', isBasic: true }], bench: [null], active: { id: 'p003', uid: 'card-2', name: 'Test Card 2' }, points: 0, hasPlayedSupporter: false },
          2: { deck: [], hand: [], bench: [{ id: 'p005', uid: 'card-3', name: 'Test Card 3' }], active: null, points: 1, hasPlayedSupporter: false },
        },
      });

      // ACT: Fire the initialization event to trigger a render
      eventBus.dispatchEvent(new CustomEvent('gameInitialized', { detail: initialState }));

      // ASSERT: The DOM reflects the state
      expect(document.querySelector('#player-1-area [data-card-uid="card-1"]')).not.toBeNull();
      expect(document.querySelector('#player-1-area [data-card-uid="card-2"]')).not.toBeNull();
      expect(document.querySelector('#player-2-area [data-card-uid="card-3"]')).not.toBeNull();
      expect(document.querySelector('#player-1-area .player-stats')?.textContent).toContain('Points: 0');
      expect(document.querySelector('#player-2-area .player-stats')?.textContent).toContain('Points: 1');
    });
    
    it('should show/hide control buttons based on game phase and current player', () => {
      // Test setup phase
      const setupState = createTestGameState({ phase: 'setup', setupReady: { 1: false, 2: false }});
      eventBus.dispatchEvent(new CustomEvent('gameStateUpdated', { detail: setupState }));
      expect(document.querySelector<HTMLButtonElement>('#p1-ready-btn')?.classList.contains('hidden')).toBe(false);
      expect(document.querySelector<HTMLButtonElement>('#end-turn-btn')?.classList.contains('hidden')).toBe(true);
      
      // Test Player 1's turn
      const p1TurnState = createTestGameState({ phase: 'playing', currentPlayer: 1 });
      eventBus.dispatchEvent(new CustomEvent('gameStateUpdated', { detail: p1TurnState }));
      expect(document.querySelector<HTMLButtonElement>('#p1-ready-btn')?.classList.contains('hidden')).toBe(true);
      expect(document.querySelector<HTMLButtonElement>('#end-turn-btn')?.classList.contains('hidden')).toBe(false);
      
      // Test Player 2's turn
      const p2TurnState = createTestGameState({ phase: 'playing', currentPlayer: 2 });
      eventBus.dispatchEvent(new CustomEvent('gameStateUpdated', { detail: p2TurnState }));
      expect(document.querySelector<HTMLButtonElement>('#p1-ready-btn')?.classList.contains('hidden')).toBe(true);
      expect(document.querySelector<HTMLButtonElement>('#end-turn-btn')?.classList.contains('hidden')).toBe(true);
    });

    it('should display the winner message on "gameEnded"', () => {
        const winMessageEl = document.querySelector<HTMLElement>('#win-message')!;
        expect(winMessageEl.classList.contains('hidden')).toBe(true);

        eventBus.dispatchEvent(new CustomEvent('gameEnded', { detail: { winner: 1 as PlayerId } }));

        expect(winMessageEl.classList.contains('hidden')).toBe(false);
        expect(winMessageEl.textContent).toBe('Player 1 Wins!');
    });
  });

  describe('Player Actions (Clicks)', () => {
    it('should call gameState.playCard when a playable card in hand is clicked', () => {
        // ARRANGE
        const state = createTestGameState({
            players: { 1: { hand: [{ id: 'p001', uid: 'card-1', name: 'Test Card', isBasic: true }], bench: [], active: null, points: 0, hasPlayedSupporter: false, deck: [] }, 2: { hand: [], bench: [], active: null, points: 0, hasPlayedSupporter: false, deck: [] } }
        });
        eventBus.dispatchEvent(new CustomEvent('gameInitialized', { detail: state }));
        const cardInHand = document.querySelector<HTMLElement>('#player-1-area .hand .card[data-action="playCard"]');
        
        // ACT
        cardInHand!.click();

        // ASSERT
        expect(gameState.playCard).toHaveBeenCalledOnce();
        expect(gameState.playCard).toHaveBeenCalledWith(1, 0); // player 1, handIndex 0
    });
    
    it('should call gameState.attack when the active card is clicked', () => {
        // ARRANGE
        const state = createTestGameState({
            players: { 1: { hand: [], bench: [], active: { id: 'p001', uid: 'card-1', name: 'Attacker' }, points: 0, hasPlayedSupporter: false, deck: [] }, 2: { hand: [], bench: [], active: { id: 'p003', uid: 'card-2', name: 'Defender' }, points: 0, hasPlayedSupporter: false, deck: [] } }
        });
        eventBus.dispatchEvent(new CustomEvent('gameInitialized', { detail: state }));
        const activeCard = document.querySelector<HTMLElement>('#player-1-area .active-slot .card[data-action="attack"]');

        // ACT
        activeCard!.click();

        // ASSERT: The call is delayed for the attack animation
        expect(gameState.attack).not.toHaveBeenCalled();
        vi.runAllTimers();
        expect(gameState.attack).toHaveBeenCalledOnce();
    });

    it('should call gameState.endTurn when the "End Turn" button is clicked', () => {
        const state = createTestGameState({ currentPlayer: 1, phase: 'playing' });
        eventBus.dispatchEvent(new CustomEvent('gameInitialized', { detail: state }));
        
        document.querySelector<HTMLButtonElement>('#end-turn-btn')!.click();

        expect(gameState.endTurn).toHaveBeenCalledOnce();
    });
  });

  describe('Player Actions (Drag and Drop)', () => {
    it('should call gameState.evolve when an evolution card is dropped on a valid target', () => {
        // ARRANGE
        const state = createTestGameState({
            turnCount: 2, // Must not be turn 1 for evolution
            players: {
                1: { hand: [{ id: 'p002', uid: 'evo-card', name: 'Evo Card', evolvesFrom: 'p001' }], bench: [], active: { id: 'p001', uid: 'base-card', name: 'Base Card', turnPlaced: 1 }, points: 0, hasPlayedSupporter: false, deck: [] },
                2: { hand: [], bench: [], active: null, points: 0, hasPlayedSupporter: false, deck: [] }
            }
        });
        eventBus.dispatchEvent(new CustomEvent('gameInitialized', { detail: state }));
        // The UI logic will add the draggable attribute, so we query for it
        const evoCard = document.querySelector<HTMLElement>('[data-card-uid="evo-card"][draggable="true"]')!;
        const activeSlot = document.querySelector<HTMLElement>('#player-1-area .active-slot')!;
        expect(evoCard).not.toBeNull(); // Verify the UI logic correctly made the card draggable
        
        // ACT: Simulate a drag-and-drop event
        const dataTransfer = {
          getData: vi.fn().mockReturnValue('0'), // handIndex of the evo card
          setData: vi.fn(),
        };
        const dragStartEvent = new Event('dragstart', { bubbles: true });
        Object.assign(dragStartEvent, { dataTransfer });
        evoCard.dispatchEvent(dragStartEvent);

        const dropEvent = new Event('drop', { bubbles: true });
        Object.assign(dropEvent, { dataTransfer });
        activeSlot.dispatchEvent(dropEvent);

        // ASSERT
        expect(gameState.evolve).toHaveBeenCalledOnce();
        expect(gameState.evolve).toHaveBeenCalledWith(1, 0, -1); // player 1, handIndex 0, targetIndex -1 (active)
    });
  });

  describe('Modal Interactions', () => {
    it('should show the card modal on long press', () => {
        // ARRANGE
        const state = createTestGameState({
            players: { 1: { hand: [{ id: 'p001', uid: 'card-1', name: 'Test Card', isBasic: true }], bench: [], active: null, points: 0, hasPlayedSupporter: false, deck: [] }, 2: { hand: [], bench: [], active: null, points: 0, hasPlayedSupporter: false, deck: [] } }
        });
        eventBus.dispatchEvent(new CustomEvent('gameInitialized', { detail: state }));
        const cardInHand = document.querySelector<HTMLElement>('[data-card-uid="card-1"]')!;
        const modal = document.querySelector<HTMLElement>('#card-modal')!;
        const modalImage = document.querySelector<HTMLImageElement>('#card-modal-image')!;
        
        // ACT: pointerdown starts the timer. Our mock ensures this event bubbles.
        cardInHand.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
        
        // ASSERT: Modal is not yet visible
        expect(modal.classList.contains('hidden')).toBe(true);

        // ACT: Advance time to trigger the long press
        vi.advanceTimersByTime(500);

        // ASSERT: Modal is now visible with the correct image
        expect(modal.classList.contains('hidden')).toBe(false);
        expect(modalImage.src).toContain('images/p001.png');
    });

    it('should close the modal when the close button is clicked', () => {
        // ARRANGE: Start with the modal open
        const modal = document.querySelector<HTMLElement>('#card-modal')!;
        const closeBtn = document.querySelector<HTMLElement>('.card-modal-close')!;
        modal.classList.remove('hidden');

        // ACT
        closeBtn.click();

        // ASSERT
        expect(modal.classList.contains('hidden')).toBe(true);
    });
  });
});