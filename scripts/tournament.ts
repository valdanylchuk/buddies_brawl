// scripts/tournament.ts

import * as fs from 'fs';
import { CARD_DATA, type Card } from '../src/decks.js';
import { gameState, GameState } from '../src/gameState.js';
// Make sure GreedyAIController is properly imported.
import { AIController, GreedyAIController } from '../src/ai.js';

/**
 * Resets the singleton gameState instance to a clean slate before each match.
 * It creates a new GameState object and copies its initial properties over,
 * then calls initializeGame() to set up decks and hands.
 */
const resetGameState = () => {
  const freshState = new GameState();
  Object.assign(gameState, freshState);
  gameState.initializeGame();
};

/** Counts the occurrences of each card ID in an array of cards. */
const countCards = (cards: Card[]): Record<string, number> =>
  cards.reduce((acc, c) => ((acc[c.id] = (acc[c.id] || 0) + 1), acc), {} as Record<string, number>);


// --- Main Tournament Function ---
function runTournament() {
  // --- Scoped Types & Config ---
  type AIType = 'basic' | 'greedy';
  interface CardUsageData {
    name: string;
    totalDrawn: number;
    totalPlayed: number;
    useRate?: number;
  }

  const TOURNAMENT_CONFIG = {
    totalMatches: 2000,
    player1: { ai: 'greedy' as AIType },
    player2: { ai: 'basic' as AIType },
  };

  const AI_FACTORY: Record<AIType, typeof AIController> = {
    basic: AIController,
    greedy: GreedyAIController,
  };

  // --- Stats Initialization ---
  const stats = {
    summary: {
      totalMatches: TOURNAMENT_CONFIG.totalMatches,
      p1_ai: TOURNAMENT_CONFIG.player1.ai,
      p2_ai: TOURNAMENT_CONFIG.player2.ai,
      p1_wins: 0,
      p2_wins: 0,
      ties: 0,
    },
    gameDurations: { totalTurns: 0, shortestGame: Infinity, longestGame: 0 },
    cardUsage: {
      player1: Object.fromEntries(Object.entries(CARD_DATA).map(([id, card]) => [id, { name: card.name, totalDrawn: 0, totalPlayed: 0 }])) as Record<string, CardUsageData>,
      player2: Object.fromEntries(Object.entries(CARD_DATA).map(([id, card]) => [id, { name: card.name, totalDrawn: 0, totalPlayed: 0 }])) as Record<string, CardUsageData>,
    },
  };

  console.log('Starting Tournament...');
  console.log(`Matchup: ${TOURNAMENT_CONFIG.player1.ai} vs. ${TOURNAMENT_CONFIG.player2.ai}, ${TOURNAMENT_CONFIG.totalMatches} matches...`);
  const startTime = Date.now();

  // --- Main Match Loop ---
  for (let i = 0; i < TOURNAMENT_CONFIG.totalMatches; i++) {
    // 1. Reset the singleton gameState before each match.
    resetGameState();

    const { player1: p1Config, player2: p2Config } = TOURNAMENT_CONFIG;

    // Create NEW AI instances FOR EVERY MATCH. This ensures they always
    // have a reference to the CURRENT, active gameState singleton, not a stale one.
    const ais = {
      1: new AI_FACTORY[p1Config.ai](1, gameState),
      2: new AI_FACTORY[p2Config.ai](2, gameState),
    };

    const p1InitialCounts = countCards(gameState.players[1].deck);
    const p2InitialCounts = countCards(gameState.players[2].deck);

    // Have each AI run its own setup method.
    ais[1].setup();
    ais[2].setup();

    let safetyBreak = 0;
    while (!gameState.gameOver && safetyBreak++ < 200) {
      const currentPlayerAI = ais[gameState.currentPlayer as 1 | 2];
      currentPlayerAI.executeTurn();
    }

    if (gameState.winner) {
      stats.summary[gameState.winner === 1 ? 'p1_wins' : 'p2_wins']++;
      const { turnCount } = gameState;
      stats.gameDurations.totalTurns += turnCount;
      stats.gameDurations.shortestGame = Math.min(stats.gameDurations.shortestGame, turnCount);
      stats.gameDurations.longestGame = Math.max(stats.gameDurations.longestGame, turnCount);
    } else {
      stats.summary.ties++;
    }

    // --- Card Usage Calculation (Preserved Logic) ---
    [1, 2].forEach(pNum => {
      const playerState = gameState.players[pNum as 1 | 2];
      const initialCounts = pNum === 1 ? p1InitialCounts : p2InitialCounts;
      const usageData = pNum === 1 ? stats.cardUsage.player1 : stats.cardUsage.player2;
      const deckEndCounts = countCards(playerState.deck);
      const handEndCounts = countCards(playerState.hand);

      for (const cardId in initialCounts) {
        const numDrawn = (initialCounts[cardId] || 0) - (deckEndCounts[cardId] || 0);
        usageData[cardId].totalDrawn += numDrawn;
        usageData[cardId].totalPlayed += numDrawn - (handEndCounts[cardId] || 0);
      }
    });
    // --- End of Preserved Logic ---

    if ((i + 1) % 100 === 0) console.log(`... Completed ${i + 1} matches.`);
  }

  // --- Final Report Generation (no changes needed) ---
  const totalFinished = stats.summary.totalMatches - stats.summary.ties;
  const finalStats = {
    ...stats,
    summary: {
      ...stats.summary,
      p1_win_rate: (stats.summary.p1_wins / stats.summary.totalMatches) * 100,
      p2_win_rate: (stats.summary.p2_wins / stats.summary.totalMatches) * 100,
    },
    gameDurations: {
      ...stats.gameDurations,
      averageTurns: totalFinished > 0 ? stats.gameDurations.totalTurns / totalFinished : 0,
    },
  };

  console.log(`\n--- Tournament Finished in ${(Date.now() - startTime) / 1000}s ---`);
  console.log(`P1 (${finalStats.summary.p1_ai}) Wins: ${finalStats.summary.p1_wins} (${finalStats.summary.p1_win_rate.toFixed(1)}%)`);
  console.log(`P2 (${finalStats.summary.p2_ai}) Wins: ${finalStats.summary.p2_wins} (${finalStats.summary.p2_win_rate.toFixed(1)}%)`);
  console.log(`Avg Duration: ${finalStats.gameDurations.averageTurns.toFixed(2)}, Shortest: ${finalStats.gameDurations.shortestGame}, Longest: ${finalStats.gameDurations.longestGame}`);
  if (finalStats.summary.ties > 0) console.log(`Ties/Errors: ${finalStats.summary.ties}`);

  [1, 2].forEach(pNum => {
    const usageData = pNum === 1 ? finalStats.cardUsage.player1 : finalStats.cardUsage.player2;
    const playerAI = pNum === 1 ? finalStats.summary.p1_ai : finalStats.summary.p2_ai;
    console.log(`\n--- Card Use Rate for P${pNum} (${playerAI}) ---`);
    const report = Object.values(usageData)
      .filter(u => u.totalDrawn > 0)
      .map(u => ({ ...u, useRate: (u.totalPlayed / u.totalDrawn) * 100 }))
      .sort((a, b) => b.totalPlayed - a.totalPlayed)
      .map(u => ({ Name: u.name, Drawn: u.totalDrawn, Played: u.totalPlayed, 'Use %': u.useRate!.toFixed(1) }));
    console.table(report);
  });

  fs.writeFileSync('tournament_summary.json', JSON.stringify(finalStats, null, 2));
  console.log('\nSuccessfully wrote results to tournament_summary.json');
}

// --- Run ---
runTournament();