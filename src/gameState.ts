import { eventBus } from './eventBus.js';
import { DECK_CONFIGS, CARD_DATA, type DeckConfig, type Card } from './decks.js';

// --- UTILITY FUNCTIONS ---
let cardUidCounter = 0;
function createCard(id: string): Card {
  const template = CARD_DATA[id];
  if (!template) throw new Error(`Card with id ${id} not found.`);
  return { ...template, id, hp: template.hp, maxHp: template.hp, uid: String(cardUidCounter++) };
}
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function createDeck(deckConfig: DeckConfig): Card[] {
  const deck = deckConfig.cards.flatMap(({ id, count }) =>
    Array(count).fill(null).map(() => createCard(id))
  );
  return shuffle(deck);
}

// --- TYPE DEFINITIONS ---
export type PlayerId = 1 | 2;
export interface PlayerState {
  deck: Card[]; hand: Card[]; active: Card | null; bench: (Card | null)[]; points: number; hasPlayedSupporter: boolean;
}

// --- GAMESTATE CLASS ---
export class GameState {
  phase: 'setup' | 'playing' = 'setup';
  currentPlayer: PlayerId = 1;
  gameOver = false;
  winner?: PlayerId;
  turnCount = 0;
  setupReady: Record<PlayerId, boolean> = { 1: false, 2: false };
  players: Record<PlayerId, PlayerState>;

  constructor() {
    const createPlayerState = (): PlayerState => ({
      deck: [], hand: [], active: null, bench: Array(3).fill(null), points: 0, hasPlayedSupporter: false,
    });
    this.players = { 1: createPlayerState(), 2: createPlayerState() };
  }

  private getPlayer(id: PlayerId = this.currentPlayer): PlayerState { return this.players[id]; }
  private getOpponent(id: PlayerId = this.currentPlayer): PlayerState { return this.players[this.getOpponentId(id)]; }
  private getOpponentId(id: PlayerId): PlayerId { return id === 1 ? 2 : 1; }
  private canAct(player: PlayerId): boolean { return player === this.currentPlayer && this.phase === 'playing' && !this.gameOver; }

  private notify(type: string, detail: object) { eventBus.dispatchEvent(new CustomEvent(type, { detail })); }
  private update() { this.notify('gameStateUpdated', this); }

  initializeGame() {
    this.players[1].deck = createDeck(DECK_CONFIGS[0]);
    this.players[2].deck = createDeck(DECK_CONFIGS[0]);
    this.drawInitialHands();
    this.notify('gameInitialized', this);
  }

  private drawCards(player: PlayerId, count: number) {
    const p = this.getPlayer(player);
    p.hand.push(...p.deck.splice(-count));
  }

  private drawInitialHands() {
    for (const pNum of [1, 2] as const) {
      const p = this.getPlayer(pNum);
      do {
        p.deck.push(...p.hand.splice(0));
        p.deck = shuffle(p.deck);
        this.drawCards(pNum, 5);
      } while (!p.hand.some(c => c.isBasic));
    }
  }

  setPlayerReady(player: PlayerId) {
    if (this.phase !== 'setup' || !this.getPlayer(player).active) return;
    this.setupReady[player] = true;
    if (this.setupReady[1] && this.setupReady[2]) {
      this.phase = 'playing';
      this.startTurn(1);
    } else {
      this.update();
    }
  }

  private startTurn(player: PlayerId) {
    this.currentPlayer = player;
    this.turnCount++;
    this.getPlayer().hasPlayedSupporter = false;
    if (this.turnCount > 1) {
      this.drawCards(player, 1);
    }
    this.notify('turnStarted', { currentPlayer: player });
    this.update();
  }

  endTurn() {
    if (this.gameOver) return;
    this.startTurn(this.getOpponentId(this.currentPlayer));
  }

  private endGame(winner: PlayerId) {
    this.gameOver = true;
    this.winner = winner;
    this.notify('gameEnded', { winner });
  }

  playCard(player: PlayerId, handIndex: number) {
    if (this.gameOver || (this.phase === 'playing' && this.currentPlayer !== player)) return;
    const p = this.getPlayer(player);
    const card = p.hand[handIndex];
    if (!card) return;

    let cardWasPlayed = false;
    if (card.isSupporter) cardWasPlayed = this._playSupporter(p, handIndex);
    else if (card.id === 'base-007') cardWasPlayed = this._playCoachWhistle(p, handIndex);
    else if (card.id === 'base-008') cardWasPlayed = false; // requires special call playChickenNugget()
    else if (card.isBasic) cardWasPlayed = this._playBasic(p, handIndex);

    if (cardWasPlayed) this.update();
  }

  private _playSupporter(p: PlayerState, handIndex: number): boolean {
    if (this.phase === 'setup' || p.hasPlayedSupporter) return false;
    this.drawCards(this.currentPlayer, 2);
    p.hand.splice(handIndex, 1);
    p.hasPlayedSupporter = true;
    return true;
  }

  private _playCoachWhistle(p: PlayerState, handIndex: number): boolean {
    if (this.phase === 'setup') return false;
    p.hand.splice(handIndex, 1);
    const basicIndices = p.deck.map((c, i) => c.isBasic ? i : -1).filter(i => i !== -1);
    if (basicIndices.length > 0) {
      const randomIndex = basicIndices[Math.floor(Math.random() * basicIndices.length)];
      p.hand.push(...p.deck.splice(randomIndex, 1));
    }
    p.deck = shuffle(p.deck);
    return true;
  }

  private _playBasic(p: PlayerState, handIndex: number): boolean {
    const cardToPlay = p.hand.splice(handIndex, 1)[0];
    cardToPlay.turnPlaced = this.turnCount;

    if (!p.active) {
      p.active = cardToPlay;
    } else {
      const benchIdx = p.bench.indexOf(null);
      if (benchIdx === -1) {
        p.hand.splice(handIndex, 0, cardToPlay);
        return false;
      }
      p.bench[benchIdx] = cardToPlay;
    }
    return true;
  }

  private _performEvolution(p: PlayerState, evolvedCard: Card, targetCard: Card, targetBoardIndex: number) {
    const damage = (targetCard.maxHp ?? 0) - (targetCard.hp ?? 0);
    evolvedCard.hp = (evolvedCard.maxHp ?? 0) - damage;
    evolvedCard.turnPlaced = this.turnCount;
    if (targetBoardIndex === -1) p.active = evolvedCard;
    else p.bench[targetBoardIndex] = evolvedCard;
    this.update();
  }

  playChickenNugget(player: PlayerId, handIndex: number, targetBoardIndex: number): boolean {
    const p = this.getPlayer(player);
    const targetCard = targetBoardIndex === -1 ? p.active : p.bench[targetBoardIndex];

    if (!this.canAct(player) || !targetCard?.isBasic || (targetCard.turnPlaced || 0) >= this.turnCount) {
      return false;
    }
    const stage2EvoIndex = p.hand.findIndex((c, i) => i !== handIndex && c.evolvesFromBasic === targetCard.id);
    if (stage2EvoIndex === -1) return false;

    const evolvedCard = p.hand[stage2EvoIndex];
    [handIndex, stage2EvoIndex].sort((a, b) => b - a).forEach(i => p.hand.splice(i, 1));
    this._performEvolution(p, evolvedCard, targetCard, targetBoardIndex);
    return true;
  }

  evolve(player: PlayerId, handIndex: number, targetBoardIndex: number) {
    const p = this.getPlayer(player);
    const targetCard = targetBoardIndex === -1 ? p.active : p.bench[targetBoardIndex];
    
    if (!this.canAct(player) || this.turnCount <= 1 || !targetCard
        || !p.hand[handIndex]?.evolvesFrom
        || p.hand[handIndex].evolvesFrom !== targetCard.id
        || (targetCard.turnPlaced || 0) >= this.turnCount
    ) return;
    const [evolvedCard] = p.hand.splice(handIndex, 1);
    this._performEvolution(p, evolvedCard, targetCard, targetBoardIndex);
  }

  attack() {
    if (!this.canAct(this.currentPlayer)) return;
    const p = this.getPlayer();
    const o = this.getOpponent();
    if (!p.active || !o.active) return;

    o.active.hp = (o.active.hp ?? 0) - (p.active.attackDamage ?? 0);

    if (o.active.hp <= 0) {
      p.points += o.active.isEx ? 2 : 1;
      o.active = null;

      const canOpponentContinue = o.bench.some(c => c !== null);
      if (p.points >= 3 || !canOpponentContinue) {
        return this.endGame(this.currentPlayer);
      }
    }
    this.endTurn();
  }

  promote(player: PlayerId, benchIndex: number) {
    const p = this.getPlayer(player);
    if (this.gameOver || p.active || !p.bench[benchIndex]) return;
    p.active = p.bench.splice(benchIndex, 1, null)[0];
    this.update();
  }

  retreat(player: PlayerId, benchIndex: number) {
    if (!this.canAct(player)) return;
    const p = this.getPlayer(player);
    if (!p.active || !p.bench[benchIndex]) return;
    [p.active, p.bench[benchIndex]] = [p.bench[benchIndex], p.active];
    this.update();
  }
}

export const gameState = new GameState();

export { createCard, createDeck };