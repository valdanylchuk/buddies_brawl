import { gameState } from './gameState.js';
import { type Card } from './decks.js';

/** Describes an opportunity for a card in hand to evolve a card in play. */
export interface EvolutionOpportunity {
  handIndex: number;
  targetIndex: number; // -1 for active, 0+ for bench
}

/**
 * A controller for AI players with simple, predictable logic.
 * The AI directly interacts with the singleton `gameState` instance.
 */
export class AIController {
  public playerNumber: 1 | 2;
  protected gs: typeof gameState;

  constructor(playerNumber: 1 | 2, gameStateInstance: typeof gameState) {
    this.playerNumber = playerNumber;
    this.gs = gameStateInstance;
  }

  // --- Helper to get the AI's current player state ---
  private get pState() {
    return this.gs.players[this.playerNumber];
  }

  // --- Decision-Making Methods ---

  protected _chooseActiveBuddyIndex(hand: Card[]): number {
    return hand.findIndex((card: Card) => card.isBasic);
  }

  protected _chooseBenchBuddyIndices(hand: Card[]): number[] {
    return hand
      .map((card: Card, index: number) => (card.isBasic ? index : -1))
      .filter((index: number) => index !== -1)
      .sort((a, b) => b - a);
  }

  protected _choosePromotionBuddyIndex(bench: (Card | null)[]): number {
    return bench.findIndex((card: Card | null) => card !== null);
  }
  
  protected _findEvolutionOpportunities(): EvolutionOpportunity[] {
    const { hand, bench, active } = this.pState;
    const currentTurn = this.gs.turnCount;

    // The gameState.evolve method already checks this, but it's more efficient for the AI to know, too.
    if (this.gs.turnCount <= 1) return [];

    const allTargets = [
      { card: active, index: -1 }, 
      ...bench.map((card: Card | null, index: number) => ({ card, index }))
    ];
    
    return allTargets.flatMap(({ card, index }) => {
      // A Pokémon cannot evolve on the turn it was placed.
      // The correct check is to see if the placement turn is the same as the current turn.
      if (!card || card.turnPlaced === currentTurn) return [];

      const evolutionHandIndex = hand.findIndex((hCard: Card) => hCard.evolvesFrom === card.id);
      if (evolutionHandIndex !== -1) {
          return [{ handIndex: evolutionHandIndex, targetIndex: index }];
      }
      return [];
    });
  }

  protected _findChickenNuggetOpportunities(): EvolutionOpportunity[] {
    const { hand, bench, active } = this.pState;
    const currentTurn = this.gs.turnCount;

    // Find Chicken Nugget cards in hand
    const chickenNuggetIndices = hand
      .map((card: Card, index: number) => (card.id === 'base-008' ? index : -1))
      .filter((index: number) => index !== -1);

    if (chickenNuggetIndices.length === 0) return [];

    const allTargets = [
      { card: active, index: -1 },
      ...bench.map((card: Card | null, index: number) => ({ card, index }))
    ];
    
    return allTargets.flatMap(({ card, index }) => {
      // Check if target is a basic card
      if (!card?.isBasic) return [];

      // Find evolution cards in hand that evolve from this basic
      const evolutionCardIndex = hand.findIndex((hCard: Card, hIndex: number) =>
        hCard.evolvesFromBasic === card.id && !chickenNuggetIndices.includes(hIndex)
      );

      if (evolutionCardIndex === -1) return [];

      // Return the Chicken Nugget index and target index
      return chickenNuggetIndices.map(chickenIndex => ({
        handIndex: chickenIndex,
        targetIndex: index
      }));
    });
  }

  // --- Core Action-Execution Flow ---

  public setup(): void {
    const activeCandidateIndex = this._chooseActiveBuddyIndex(this.pState.hand);
    if (activeCandidateIndex > -1) {
      this.gs.playCard(this.playerNumber, activeCandidateIndex);
    } else {
      console.error(`AI P${this.playerNumber} has no basic Buddy to place!`);
      return;
    }

    this._chooseBenchBuddyIndices(this.pState.hand).forEach((index: number) => {
      this.gs.playCard(this.playerNumber, index);
    });

    this.gs.setPlayerReady(this.playerNumber);
  }

  public executeTurn(): void {
    if (this.gs.gameOver || this.gs.currentPlayer !== this.playerNumber) return;

    if (!this.pState.active) {
      const promotionIndex = this._choosePromotionBuddyIndex(this.pState.bench);
      if (promotionIndex > -1) {
        this.gs.promote(this.playerNumber, promotionIndex);
      } else {
        this.gs.endTurn();
        return;
      }
    }
    
    if (!this.pState.hasPlayedSupporter) {
      const supporterIndex = this.pState.hand.findIndex((c: Card) => c.isSupporter);
      if (supporterIndex > -1) this.gs.playCard(this.playerNumber, supporterIndex);
    }

    let itemIndex: number;
    for (let i = this.pState.hand.length - 1; i >= 0; i--) {
      const card = this.pState.hand[i];
      if (card.isItem && card.id !== 'base-008') {
        this.gs.playCard(this.playerNumber, i);
      }
    }

    // Check for Chicken Nugget opportunities first (higher priority)
    const chickenNuggetOpps = this._findChickenNuggetOpportunities();
    if (chickenNuggetOpps.length > 0) {
      const { handIndex, targetIndex } = chickenNuggetOpps[0];
      this.gs.playChickenNugget(this.playerNumber, handIndex, targetIndex);
    }

    // Also check for regular evolution opportunities
    const evolutionOpps = this._findEvolutionOpportunities();
    if (evolutionOpps.length > 0) {
      const { handIndex, targetIndex } = evolutionOpps[0];
      this.gs.evolve(this.playerNumber, handIndex, targetIndex);
    }

    this._chooseBenchBuddyIndices(this.pState.hand).forEach((index: number) => {
      this.gs.playCard(this.playerNumber, index);
    });

    if (this.pState.active) {
      this.gs.attack();
    } else {
      this.gs.endTurn();
    }
  }
}

/**
 * An AI that uses a greedy strategy, always prioritizing the highest HP Buddy.
 */
export class GreedyAIController extends AIController {
  private _findStrongestCardIndex(cards: (Card | null)[], filterFn: (card: Card) => boolean): number {
    let bestIndex = -1;
    let maxHp = -1;

    cards.forEach((card, index) => {
      if (card && filterFn(card)) {
        const hp = card.hp ?? 0;
        if (hp > maxHp) {
          maxHp = hp;
          bestIndex = index;
        }
      }
    });
    return bestIndex;
  }

  override _chooseActiveBuddyIndex(hand: Card[]): number {
    return this._findStrongestCardIndex(hand, (card: Card) => card.isBasic === true);
  }

  override _choosePromotionBuddyIndex(bench: (Card | null)[]): number {
    return this._findStrongestCardIndex(bench, () => true);
  }
}