const { generateCode, shuffleArray, scoreSubmission } = require('./utils');

class GameManager {
  constructor() {
    this.games = new Map();
    // Cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  createGame({ bookId, fromIndex, toIndex, wordCount, maxPlayers, words }) {
    if (words.length < wordCount) {
      throw new Error('Not enough words in range');
    }

    const selected = shuffleArray(words).slice(0, wordCount);
    const leftOrder = shuffleArray(selected.map((_, i) => i));
    const rightOrder = shuffleArray(selected.map((_, i) => i));

    let code;
    do { code = generateCode(); } while (this.games.has(code));

    const game = {
      code,
      bookId,
      words: selected,
      leftOrder,
      rightOrder,
      maxPlayers: Math.min(Math.max(maxPlayers || 2, 2), 5),
      players: {},        // socketId -> { number, connected }
      creatorId: null,     // socketId of game creator
      status: 'waiting',   // waiting | countdown | playing | finished
      submissions: {},     // socketId -> { playerNumber, correct, total, timeTaken, matches }
      startTime: null,
      countdownTimer: null,
      finishTimeout: null,
      rematchVotes: null,
      createdAt: Date.now(),
    };

    this.games.set(code, game);
    return game;
  }

  getGame(code) {
    return this.games.get(code);
  }

  joinGame(code, socketId) {
    const game = this.games.get(code);
    if (!game) return { error: 'gameNotFound' };

    const playerIds = Object.keys(game.players);

    // Already in the game (reconnect)
    if (game.players[socketId]) {
      game.players[socketId].connected = true;
      return { game, playerNumber: game.players[socketId].number, reconnect: true };
    }

    // Game full
    if (playerIds.length >= game.maxPlayers) {
      return { error: 'gameFull' };
    }

    const playerNumber = playerIds.length + 1;
    game.players[socketId] = { number: playerNumber, connected: true };

    // First player is the creator
    if (playerNumber === 1) {
      game.creatorId = socketId;
    }

    return { game, playerNumber, reconnect: false };
  }

  getPlayerCount(code) {
    const game = this.games.get(code);
    if (!game) return 0;
    return Object.keys(game.players).length;
  }

  canStart(code) {
    const game = this.games.get(code);
    if (!game) return false;
    return Object.keys(game.players).length >= 2 && game.status === 'waiting';
  }

  startCountdown(code) {
    const game = this.games.get(code);
    if (!game) return false;
    game.status = 'countdown';
    return true;
  }

  startPlaying(code) {
    const game = this.games.get(code);
    if (!game) return null;
    game.status = 'playing';
    game.startTime = Date.now();
    return {
      words: game.words,
      leftOrder: game.leftOrder,
      rightOrder: game.rightOrder,
    };
  }

  submitAnswer(code, socketId, matches) {
    const game = this.games.get(code);
    if (!game || game.status !== 'playing') return null;
    if (!game.players[socketId]) return null;

    const timeTaken = (Date.now() - game.startTime) / 1000;
    const correct = scoreSubmission(matches);

    game.submissions[socketId] = {
      playerNumber: game.players[socketId].number,
      correct,
      total: game.words.length,
      timeTaken: Math.round(timeTaken * 10) / 10,
      matches,
    };

    return {
      playerNumber: game.players[socketId].number,
      submissionCount: Object.keys(game.submissions).length,
      playerCount: Object.keys(game.players).length,
    };
  }

  endGame(code) {
    const game = this.games.get(code);
    if (!game || game.status === 'finished') return null;

    game.status = 'finished';
    if (game.finishTimeout) clearTimeout(game.finishTimeout);
    if (game.countdownTimer) clearInterval(game.countdownTimer);

    const results = [...Object.values(game.submissions)];

    // Players who didn't submit get 0
    for (const [pid, player] of Object.entries(game.players)) {
      if (!game.submissions[pid]) {
        results.push({
          playerNumber: player.number,
          correct: 0,
          total: game.words.length,
          timeTaken: 30,
          matches: [],
        });
      }
    }

    // Sort: most correct first, then fastest
    results.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.timeTaken - b.timeTaken;
    });

    return { results, words: game.words };
  }

  addRematchVote(code, socketId) {
    const game = this.games.get(code);
    if (!game) return null;

    if (!game.rematchVotes) game.rematchVotes = new Set();
    game.rematchVotes.add(socketId);

    const playerCount = Object.keys(game.players).length;
    const needed = Math.ceil(playerCount / 2); // majority

    if (game.rematchVotes.size >= needed) {
      // Reset for rematch
      const selected = shuffleArray(game.words);
      game.words = selected;
      game.leftOrder = shuffleArray(selected.map((_, i) => i));
      game.rightOrder = shuffleArray(selected.map((_, i) => i));
      game.status = 'countdown';
      game.submissions = {};
      game.rematchVotes = null;
      game.startTime = null;
      if (game.finishTimeout) clearTimeout(game.finishTimeout);
      return { rematchStarting: true };
    }

    return { rematchStarting: false, votes: game.rematchVotes.size, needed };
  }

  disconnectPlayer(code, socketId) {
    const game = this.games.get(code);
    if (!game || !game.players[socketId]) return;
    game.players[socketId].connected = false;
  }

  cleanup() {
    const now = Date.now();
    for (const [code, game] of this.games) {
      if (now - game.createdAt > 60 * 60 * 1000) {
        if (game.countdownTimer) clearInterval(game.countdownTimer);
        if (game.finishTimeout) clearTimeout(game.finishTimeout);
        this.games.delete(code);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    for (const [, game] of this.games) {
      if (game.countdownTimer) clearInterval(game.countdownTimer);
      if (game.finishTimeout) clearTimeout(game.finishTimeout);
    }
  }
}

module.exports = GameManager;
