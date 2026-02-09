const { generateCode, shuffleArray, scoreSubmission } = require('./utils');
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

class GameManager {
  constructor() {
    this.games = new Map();
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
      players: {},          // playerToken -> { number, connected, socketId }
      creatorToken: null,
      status: 'waiting',    // waiting | countdown | playing | finished
      submissions: {},      // playerToken -> { playerNumber, correct, total, timeTaken, matches }
      startTime: null,      // authoritative server timestamp
      countdownTimer: null,
      finishTimeout: null,
      rematchVotes: null,
      lastResults: null,    // cached for reconnecting players
      createdAt: Date.now(),
    };

    this.games.set(code, game);
    return game;
  }

  getGame(code) {
    return this.games.get(code);
  }

  /**
   * Join or reconnect to a game.
   * @param {string} code - Game code
   * @param {string|null} playerToken - Existing token (reconnect) or null (new join)
   * @param {string} socketId - Current socket ID
   */
  joinGame(code, playerToken, socketId) {
    const game = this.games.get(code);
    if (!game) return { error: 'gameNotFound' };

    // Reconnect: player has a valid token for this game
    if (playerToken && game.players[playerToken]) {
      const player = game.players[playerToken];
      player.connected = true;
      player.socketId = socketId;
      return {
        game,
        playerNumber: player.number,
        playerToken,
        reconnect: true,
      };
    }

    // New join: check capacity and status
    const playerCount = Object.keys(game.players).length;
    if (playerCount >= game.maxPlayers) {
      return { error: 'gameFull' };
    }
    if (game.status !== 'waiting') {
      return { error: 'gameInProgress' };
    }

    const token = generateToken();
    const playerNumber = playerCount + 1;
    game.players[token] = {
      number: playerNumber,
      connected: true,
      socketId,
    };

    if (playerNumber === 1) {
      game.creatorToken = token;
    }

    return {
      game,
      playerNumber,
      playerToken: token,
      reconnect: false,
    };
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
      startTime: game.startTime, // authoritative
    };
  }

  submitAnswer(code, playerToken, matches) {
    const game = this.games.get(code);
    if (!game || game.status !== 'playing') return null;
    if (!game.players[playerToken]) return null;
    if (game.submissions[playerToken]) return null; // already submitted

    const timeTaken = (Date.now() - game.startTime) / 1000;
    const correct = scoreSubmission(matches);

    game.submissions[playerToken] = {
      playerNumber: game.players[playerToken].number,
      correct,
      total: game.words.length,
      timeTaken: Math.round(timeTaken * 10) / 10,
      matches,
    };

    return {
      playerNumber: game.players[playerToken].number,
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

    for (const [token, player] of Object.entries(game.players)) {
      if (!game.submissions[token]) {
        results.push({
          playerNumber: player.number,
          correct: 0,
          total: game.words.length,
          timeTaken: 30,
          matches: [],
        });
      }
    }

    results.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.timeTaken - b.timeTaken;
    });

    const resultData = { results, words: game.words };
    game.lastResults = resultData;
    return resultData;
  }

  addRematchVote(code, playerToken) {
    const game = this.games.get(code);
    if (!game) return null;

    if (!game.rematchVotes) game.rematchVotes = new Set();
    game.rematchVotes.add(playerToken);

    const playerCount = Object.keys(game.players).length;
    const needed = Math.ceil(playerCount / 2);

    if (game.rematchVotes.size >= needed) {
      const selected = shuffleArray(game.words);
      game.words = selected;
      game.leftOrder = shuffleArray(selected.map((_, i) => i));
      game.rightOrder = shuffleArray(selected.map((_, i) => i));
      game.status = 'countdown';
      game.submissions = {};
      game.rematchVotes = null;
      game.startTime = null;
      game.lastResults = null;
      if (game.finishTimeout) clearTimeout(game.finishTimeout);
      return { rematchStarting: true };
    }

    return { rematchStarting: false, votes: game.rematchVotes.size, needed };
  }

  disconnectPlayer(code, playerToken) {
    const game = this.games.get(code);
    if (!game || !game.players[playerToken]) return;
    game.players[playerToken].connected = false;
    game.players[playerToken].socketId = null;
  }

  /**
   * Full game state for reconnecting players.
   */
  getGameState(code, playerToken) {
    const game = this.games.get(code);
    if (!game || !game.players[playerToken]) return null;

    const player = game.players[playerToken];
    const playerCount = Object.keys(game.players).length;

    const state = {
      status: game.status,
      playerNumber: player.number,
      playerCount,
      maxPlayers: game.maxPlayers,
      isCreator: game.creatorToken === playerToken,
    };

    if (game.status === 'playing' || game.status === 'countdown') {
      state.words = game.words;
      state.leftOrder = game.leftOrder;
      state.rightOrder = game.rightOrder;
      state.startTime = game.startTime;
      state.hasSubmitted = !!game.submissions[playerToken];

      // Which players have submitted
      state.submittedPlayers = Object.values(game.submissions)
        .map(s => s.playerNumber);
    }

    if (game.status === 'finished' && game.lastResults) {
      state.results = game.lastResults;
    }

    return state;
  }

  /**
   * Find playerToken by socketId (for disconnect handling).
   */
  findTokenBySocket(code, socketId) {
    const game = this.games.get(code);
    if (!game) return null;
    for (const [token, player] of Object.entries(game.players)) {
      if (player.socketId === socketId) return token;
    }
    return null;
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