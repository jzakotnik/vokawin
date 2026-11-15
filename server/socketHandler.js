const { CODE_LENGTH } = require('./utils');

const CODE_RE = new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`);
const EVENT_WINDOW_MS = 10 * 1000;
const EVENT_LIMIT = 150; // events per socket per window

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function setupSocketHandler(io, gameManager) {
  gameManager.setHooks({
    countdown: (code, n) => io.to(code).emit('countdown', n),
    gameStart: (code, data) => io.to(code).emit('game-start', data),
    gameOver: (code, results) => io.to(code).emit('game-over', results),
    playerRemoved: (code) => {
      const game = gameManager.getGame(code);
      if (game) io.to(code).emit('player-count', { count: gameManager.getPlayerCount(code), max: game.maxPlayers });
    },
    creatorChanged: (code, socketId) => io.to(socketId).emit('creator-changed'),
  });

  io.on('connection', (socket) => {
    let currentGame = null;
    let currentToken = null;
    let playerNumber = null;

    // Simple per-socket flood protection
    let windowStart = Date.now();
    let eventCount = 0;
    socket.use((_packet, next) => {
      const now = Date.now();
      if (now - windowStart > EVENT_WINDOW_MS) { windowStart = now; eventCount = 0; }
      if (++eventCount > EVENT_LIMIT) return next(new Error('rateLimited'));
      next();
    });

    // Every handler: validated input, errors never escape (an uncaught throw would kill the process).
    const on = (event, handler) => {
      socket.on(event, (...args) => {
        try {
          handler(...args);
        } catch (err) {
          console.error(`[socket] error in "${event}":`, err);
        }
      });
    };

    on('join-game', (data) => {
      if (!isObject(data) || typeof data.code !== 'string') {
        return socket.emit('error-msg', 'invalidRequest');
      }
      const code = data.code.trim().toUpperCase();
      const clientToken = typeof data.playerToken === 'string' && data.playerToken.length <= 64
        ? data.playerToken : null;
      if (!CODE_RE.test(code)) return socket.emit('error-msg', 'gameNotFound');

      // One socket belongs to one game.
      if (currentGame && currentGame !== code) return socket.emit('error-msg', 'invalidRequest');

      const result = gameManager.joinGame(code, clientToken, socket.id);
      if (result.error) return socket.emit('error-msg', result.error);

      const game = result.game;
      currentGame = code;
      currentToken = result.playerToken;
      playerNumber = result.playerNumber;
      socket.join(code);

      const playerCount = gameManager.getPlayerCount(code);

      socket.emit('joined', {
        playerNumber,
        playerToken: result.playerToken,
        status: game.status,
        playerCount,
        maxPlayers: game.maxPlayers,
        isCreator: game.creatorToken === result.playerToken,
      });

      if (result.reconnect) {
        const state = gameManager.getGameState(code, currentToken);
        if (state) socket.emit('game-state-sync', state);
        socket.to(code).emit('player-reconnected', { playerNumber });
      }

      io.to(code).emit('player-count', { count: playerCount, max: game.maxPlayers });

      // Auto-start when the lobby is full
      if (!result.reconnect && playerCount === game.maxPlayers && game.status === 'waiting') {
        gameManager.startCountdown(code);
      }
    });

    on('creator-start', () => {
      if (!currentGame || !currentToken) return;
      gameManager.startCountdown(currentGame, currentToken);
    });

    on('progress-update', (data) => {
      if (!currentGame || !currentToken || !isObject(data)) return;
      const progress = gameManager.updateProgress(currentGame, currentToken, data.matches);
      if (!progress) return;
      socket.to(currentGame).emit('player-progress', progress);
    });

    on('submit-answer', (data) => {
      if (!currentGame || !currentToken || !isObject(data)) return;
      const result = gameManager.submitAnswer(currentGame, currentToken, data.matches);
      if (!result) return;
      socket.to(currentGame).emit('player-finished', { playerNumber: result.playerNumber });
    });

    on('request-rematch', () => {
      if (!currentGame || !currentToken) return;
      const result = gameManager.addRematchVote(currentGame, currentToken);
      if (!result) return;

      if (result.rematchStarting) {
        io.to(currentGame).emit('rematch-start');
        gameManager.runCountdown(currentGame);
      } else {
        socket.to(currentGame).emit('rematch-requested', { votes: result.votes, needed: result.needed });
      }
    });

    socket.on('disconnect', () => {
      if (!currentGame || !currentToken) return;
      const { ignored } = gameManager.disconnectPlayer(currentGame, currentToken, socket.id);
      if (ignored) return;
      socket.to(currentGame).emit('player-disconnected', { playerNumber });
    });
  });
}

module.exports = setupSocketHandler;
