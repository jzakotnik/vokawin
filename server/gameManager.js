const { generateCode, generateId, generateToken, shuffleArray, isInt } = require('./utils');

const LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 5,
  MIN_WORDS: 2,
  MAX_WORDS: 30,
  MAX_GAMES: 500,
};

const TIMING = {
  COUNTDOWN_SECONDS: 5,
  ROUND_TIMEOUT_MS: 5 * 60 * 1000,   // hard limit for one round
  FINISH_GRACE_MS: 30 * 1000,        // time left for others after the first submission
  LOBBY_LEAVE_GRACE_MS: 45 * 1000,   // disconnected lobby player keeps the slot this long
  IDLE_TTL_MS: 60 * 60 * 1000,       // game without any activity is removed
  UNJOINED_TTL_MS: 10 * 60 * 1000,   // created via REST but nobody ever joined
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
};

const noop = () => {};

/**
 * Build one round. The server keeps the answer key; clients only receive two
 * independently shuffled lists with opaque, unrelated ids, so the correct
 * pairing cannot be derived from what is sent.
 */
function buildRound(wordPool, wordCount) {
  const words = shuffleArray(wordPool).slice(0, wordCount);
  const left = shuffleArray(words.map((w, i) => ({ id: generateId(), index: i, text: w.source })));
  const right = shuffleArray(words.map((w, i) => ({ id: generateId(), index: i, text: w.target })));

  const rightByIndex = new Map(right.map(r => [r.index, r.id]));
  const answer = new Map(left.map(l => [l.id, rightByIndex.get(l.index)]));
  const leftIndex = new Map(left.map(l => [l.id, l.index]));
  const rightIndex = new Map(right.map(r => [r.id, r.index]));

  return { words, left, right, answer, leftIndex, rightIndex };
}

function publicRound(round) {
  return {
    left: round.left.map(({ id, text }) => ({ id, text })),
    right: round.right.map(({ id, text }) => ({ id, text })),
  };
}

/**
 * Clean a client-supplied match list: must be an array; entries with unknown ids
 * are dropped, as are duplicates of an already used left/right id.
 * Returns null if the input is not an array.
 */
function cleanMatches(round, matches) {
  if (!Array.isArray(matches)) return null;
  const usedLeft = new Set();
  const usedRight = new Set();
  const clean = [];
  for (const m of matches.slice(0, round.words.length)) {
    if (!m || typeof m.left !== 'string' || typeof m.right !== 'string') continue;
    if (!round.leftIndex.has(m.left) || !round.rightIndex.has(m.right)) continue;
    if (usedLeft.has(m.left) || usedRight.has(m.right)) continue;
    usedLeft.add(m.left);
    usedRight.add(m.right);
    clean.push({ left: m.left, right: m.right });
  }
  return clean;
}

function scoreMatches(round, clean) {
  return clean.filter(m => round.answer.get(m.left) === m.right).length;
}

function describeMatches(round, clean) {
  return clean.map(m => {
    const word = round.words[round.leftIndex.get(m.left)];
    const answered = round.words[round.rightIndex.get(m.right)];
    return {
      source: word.source,
      expected: word.target,
      answered: answered.target,
      ok: round.answer.get(m.left) === m.right,
    };
  });
}

class GameManager {
  constructor() {
    this.games = new Map();
    this.hooks = {
      countdown: noop,       // (code, secondsLeft)
      gameStart: noop,       // (code, payload)
      gameOver: noop,        // (code, results)
      playerRemoved: noop,   // (code)
      creatorChanged: noop,  // (code, socketId)
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), TIMING.CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }

  setHooks(hooks) {
    Object.assign(this.hooks, hooks);
  }

  // ---------- creation / lookup ----------

  createGame({ bookId, wordCount, maxPlayers, words }) {
    if (this.games.size >= LIMITS.MAX_GAMES) throw new Error('serverBusy');
    if (!isInt(wordCount) || wordCount < LIMITS.MIN_WORDS || wordCount > LIMITS.MAX_WORDS) {
      throw new Error('invalidWordCount');
    }
    if (words.length < wordCount) throw new Error('notEnoughWords');

    let code;
    do { code = generateCode(); } while (this.games.has(code));

    const game = {
      code,
      bookId,
      wordPool: words,
      wordCount,
      round: buildRound(words, wordCount),
      maxPlayers: Math.min(Math.max(isInt(maxPlayers) ? maxPlayers : 2, LIMITS.MIN_PLAYERS), LIMITS.MAX_PLAYERS),
      players: {},          // playerToken -> { number, connected, socketId, removeTimer }
      creatorToken: null,
      status: 'waiting',    // waiting | countdown | playing | finished
      submissions: {},      // playerToken -> { playerNumber, matches(clean), timeTaken }
      progress: {},         // playerToken -> clean matches while playing (scored on timeout)
      startTime: null,
      timers: { countdown: null, finish: null, round: null },
      rematchVotes: null,
      lastResults: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.games.set(code, game);
    return game;
  }

  getGame(code) {
    return this.games.get(code);
  }

  touch(game) {
    game.lastActivity = Date.now();
  }

  getPlayerCount(code) {
    const game = this.games.get(code);
    return game ? Object.keys(game.players).length : 0;
  }

  // ---------- joining / leaving ----------

  joinGame(code, playerToken, socketId) {
    const game = this.games.get(code);
    if (!game) return { error: 'gameNotFound' };
    this.touch(game);

    // Reconnect with a known token
    if (playerToken && game.players[playerToken]) {
      const player = game.players[playerToken];
      if (player.removeTimer) {
        clearTimeout(player.removeTimer);
        player.removeTimer = null;
      }
      player.connected = true;
      player.socketId = socketId;
      return { game, playerNumber: player.number, playerToken, reconnect: true };
    }

    if (Object.keys(game.players).length >= game.maxPlayers) return { error: 'gameFull' };
    if (game.status !== 'waiting') return { error: 'gameInProgress' };

    const taken = new Set(Object.values(game.players).map(p => p.number));
    let playerNumber = 1;
    while (taken.has(playerNumber)) playerNumber++;

    const token = generateToken();
    game.players[token] = { number: playerNumber, connected: true, socketId, removeTimer: null };
    if (!game.creatorToken || !game.players[game.creatorToken]) game.creatorToken = token;

    return { game, playerNumber, playerToken: token, reconnect: false };
  }

  /**
   * Socket closed. Ignored if the player already re-attached with a newer socket
   * (e.g. page reload connects before the old socket is detected as dead).
   */
  disconnectPlayer(code, playerToken, socketId) {
    const game = this.games.get(code);
    const player = game && game.players[playerToken];
    if (!player || player.socketId !== socketId) return { ignored: true };

    player.connected = false;
    player.socketId = null;

    if (game.status === 'waiting') {
      // Free the slot if the player does not come back soon.
      player.removeTimer = setTimeout(() => this.removePlayer(code, playerToken), TIMING.LOBBY_LEAVE_GRACE_MS);
      player.removeTimer.unref();
    } else if (game.status === 'playing') {
      this.maybeEndRound(game);
    }
    return { ignored: false };
  }

  removePlayer(code, playerToken) {
    const game = this.games.get(code);
    const player = game && game.players[playerToken];
    if (!player || player.connected || game.status !== 'waiting') return;

    delete game.players[playerToken];

    if (game.creatorToken === playerToken) {
      const next = Object.entries(game.players).sort((a, b) => a[1].number - b[1].number)[0];
      game.creatorToken = next ? next[0] : null;
      if (next && next[1].socketId) this.hooks.creatorChanged(code, next[1].socketId);
    }
    this.hooks.playerRemoved(code);
  }

  // ---------- lobby -> countdown -> round ----------

  canStart(code) {
    const game = this.games.get(code);
    if (!game) return false;
    return Object.keys(game.players).length >= LIMITS.MIN_PLAYERS && game.status === 'waiting';
  }

  /** Lobby start. Returns true if the countdown was started. */
  startCountdown(code, requesterToken = null) {
    const game = this.games.get(code);
    if (!game || game.status !== 'waiting') return false;
    if (requesterToken && game.creatorToken !== requesterToken) return false;
    if (Object.keys(game.players).length < LIMITS.MIN_PLAYERS) return false;

    game.status = 'countdown';
    this.touch(game);
    this.runCountdown(code);
    return true;
  }

  runCountdown(code) {
    const game = this.games.get(code);
    if (!game) return;
    this.clearTimers(game);

    let count = TIMING.COUNTDOWN_SECONDS;
    this.hooks.countdown(code, count);

    game.timers.countdown = setInterval(() => {
      count--;
      if (count > 0) {
        this.hooks.countdown(code, count);
      } else {
        clearInterval(game.timers.countdown);
        game.timers.countdown = null;
        this.startPlaying(code);
      }
    }, 1000);
  }

  startPlaying(code) {
    const game = this.games.get(code);
    if (!game || game.status !== 'countdown') return;

    game.status = 'playing';
    game.startTime = Date.now();
    game.submissions = {};
    game.progress = {};
    this.touch(game);

    game.timers.round = setTimeout(() => this.endGame(code), TIMING.ROUND_TIMEOUT_MS);

    this.hooks.gameStart(code, { ...publicRound(game.round), startTime: game.startTime });
  }

  // ---------- playing ----------

  updateProgress(code, playerToken, matches) {
    const game = this.games.get(code);
    if (!game || game.status !== 'playing') return null;
    const player = game.players[playerToken];
    if (!player || game.submissions[playerToken]) return null;

    const clean = cleanMatches(game.round, matches);
    if (!clean) return null;

    game.progress[playerToken] = clean;
    this.touch(game);
    return { playerNumber: player.number, matched: clean.length, total: game.round.words.length };
  }

  submitAnswer(code, playerToken, matches) {
    const game = this.games.get(code);
    if (!game || game.status !== 'playing') return null;
    const player = game.players[playerToken];
    if (!player || game.submissions[playerToken]) return null;

    const clean = cleanMatches(game.round, matches);
    if (!clean) return null;

    game.submissions[playerToken] = {
      playerNumber: player.number,
      matches: clean,
      timeTaken: Math.round((Date.now() - game.startTime) / 100) / 10,
    };
    this.touch(game);

    // First submission starts the grace timer for everybody else.
    if (Object.keys(game.submissions).length === 1 && !game.timers.finish) {
      game.timers.finish = setTimeout(() => this.endGame(code), TIMING.FINISH_GRACE_MS);
    }
    this.maybeEndRound(game);

    return { playerNumber: player.number };
  }

  /** End the round once every connected player has submitted. */
  maybeEndRound(game) {
    if (game.status !== 'playing') return;
    const connected = Object.entries(game.players).filter(([, p]) => p.connected);
    if (connected.length === 0) return; // round timeout will clean up
    if (connected.every(([token]) => game.submissions[token])) this.endGame(game.code);
  }

  endGame(code) {
    const game = this.games.get(code);
    if (!game || game.status !== 'playing') return null;

    game.status = 'finished';
    this.clearTimers(game);
    game.rematchVotes = null;

    const elapsed = Math.round((Date.now() - game.startTime) / 100) / 10;
    const total = game.round.words.length;
    const results = [];

    for (const [token, player] of Object.entries(game.players)) {
      const sub = game.submissions[token];
      const clean = sub ? sub.matches : (game.progress[token] || []);
      results.push({
        playerNumber: player.number,
        correct: scoreMatches(game.round, clean),
        total,
        timeTaken: sub ? sub.timeTaken : elapsed,
        submitted: !!sub,
        matches: describeMatches(game.round, clean),
      });
    }

    results.sort((a, b) => (b.correct - a.correct) || (a.timeTaken - b.timeTaken));

    game.lastResults = { results };
    this.touch(game);
    this.hooks.gameOver(code, game.lastResults);
    return game.lastResults;
  }

  // ---------- rematch ----------

  /**
   * Only valid once the round is finished. A strict majority of the connected
   * players must agree. When reached, a fresh round is prepared and the status
   * becomes 'countdown'; the caller then runs runCountdown().
   */
  addRematchVote(code, playerToken) {
    const game = this.games.get(code);
    if (!game || game.status !== 'finished') return null;
    if (!game.players[playerToken]) return null;

    if (!game.rematchVotes) game.rematchVotes = new Set();
    game.rematchVotes.add(playerToken);
    this.touch(game);

    const connected = Object.values(game.players).filter(p => p.connected).length;
    const needed = Math.floor(Math.max(connected, 1) / 2) + 1;

    if (game.rematchVotes.size >= needed) {
      game.round = buildRound(game.wordPool, game.wordCount);
      game.status = 'countdown';
      game.submissions = {};
      game.progress = {};
      game.rematchVotes = null;
      game.startTime = null;
      game.lastResults = null;
      return { rematchStarting: true };
    }
    return { rematchStarting: false, votes: game.rematchVotes.size, needed };
  }

  // ---------- reconnect ----------

  getGameState(code, playerToken) {
    const game = this.games.get(code);
    const player = game && game.players[playerToken];
    if (!player) return null;

    const state = {
      status: game.status,
      playerNumber: player.number,
      playerCount: Object.keys(game.players).length,
      maxPlayers: game.maxPlayers,
      isCreator: game.creatorToken === playerToken,
    };

    if (game.status === 'playing') {
      Object.assign(state, publicRound(game.round));
      state.elapsedMs = Date.now() - game.startTime;
      state.hasSubmitted = !!game.submissions[playerToken];
      const mine = game.submissions[playerToken]
        ? game.submissions[playerToken].matches
        : game.progress[playerToken];
      state.matches = mine || [];
      state.submittedPlayers = Object.values(game.submissions).map(s => s.playerNumber);
    }

    if (game.status === 'finished' && game.lastResults) {
      state.results = game.lastResults;
    }
    return state;
  }

  // ---------- housekeeping ----------

  clearTimers(game) {
    if (game.timers.countdown) clearInterval(game.timers.countdown);
    if (game.timers.finish) clearTimeout(game.timers.finish);
    if (game.timers.round) clearTimeout(game.timers.round);
    game.timers = { countdown: null, finish: null, round: null };
  }

  deleteGame(code) {
    const game = this.games.get(code);
    if (!game) return;
    this.clearTimers(game);
    for (const p of Object.values(game.players)) {
      if (p.removeTimer) clearTimeout(p.removeTimer);
    }
    this.games.delete(code);
  }

  cleanup() {
    const now = Date.now();
    for (const [code, game] of this.games) {
      const idle = now - game.lastActivity;
      const unjoined = Object.keys(game.players).length === 0;
      if (idle > TIMING.IDLE_TTL_MS || (unjoined && idle > TIMING.UNJOINED_TTL_MS)) {
        this.deleteGame(code);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    for (const code of [...this.games.keys()]) this.deleteGame(code);
  }
}

module.exports = GameManager;
module.exports.LIMITS = LIMITS;
module.exports.TIMING = TIMING;
