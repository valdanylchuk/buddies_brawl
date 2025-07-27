/**
 * Defines the static and dynamic properties of a card.
 * This is the blueprint and instance type, all in one.
 */
export interface Card {
  id: string;
  name: string;
  hp?: number;
  maxHp?: number; // Will be set on instance creation
  attackName?: string;
  attackDamage?: number;
  evolvesFrom?: string;
  evolvesFromBasic?: string;
  isBasic?: boolean;
  isEx?: boolean;
  isTrainer?: boolean;
  isSupporter?: boolean;
  isItem?: boolean;
  rule?: string;
  turnPlaced?: number; // Instance-specific, set when played
  uid?: string; // unique card instance id in a deck
}

/** Represents a single entry in a deck list, specifying a card and its quantity. */
export interface DeckCardConfig {
  id: string;
  count: number;
}

/** Defines the structure for a complete, pre-configured deck list. */
export interface DeckConfig {
  name: string;
  cards: DeckCardConfig[];
}

/**
 * A map of all available card templates. Using a map (Record) is much
 * more efficient for lookups than Array.prototype.find().
 * The card 'id' is the key, so it's omitted from the value type.
 */
export const CARD_DATA: Readonly<Record<string, Omit<Card, 'id' | 'maxHp' | 'turnPlaced'>>> = {
  'base-001': { name: 'Axolittle', hp: 60, attackName: 'Boink', attackDamage: 20, isBasic: true },
  'base-002': { name: 'Axolora', hp: 90, attackName: 'Wand Splash', attackDamage: 40, evolvesFrom: 'base-001' },
  'base-003': { name: 'Lazycat', hp: 60, attackName: 'Yawn', attackDamage: 20, isBasic: true },
  'base-004': { name: 'Guard Cat', hp: 100, attackName: 'Spine Arch', attackDamage: 40, evolvesFrom: 'base-003' },
  'base-005': { name: 'MC Scratchinator', hp: 180, attackName: 'Vinyl Scratch', attackDamage: 120, evolvesFrom: 'base-004', evolvesFromBasic: 'base-003', isEx: true },
  'base-006': { name: "Panda's Plan", rule: 'Draw 2 cards.', isTrainer: true, isSupporter: true },
  'base-007': { name: 'Coach Whistle', rule: 'Draw one random basic Buddy.', isTrainer: true, isItem: true },
  'base-008': { name: 'Chicken Nugget', rule: 'Evolve a basic Buddy to stage 2.', isTrainer: true, isItem: true },
};

/** A collection of pre-configured deck lists that players can choose from. */
export const DECK_CONFIGS: DeckConfig[] = [{
  name: 'Default Deck',
  cards: [
    { id: 'base-001', count: 3 },
    { id: 'base-002', count: 3 },
    { id: 'base-003', count: 3 },
    { id: 'base-004', count: 2 },
    { id: 'base-005', count: 2 },
    { id: 'base-006', count: 3 },
    { id: 'base-007', count: 2 },
    { id: 'base-008', count: 2 },
  ],
}];