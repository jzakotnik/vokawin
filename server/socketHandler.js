function setupSocketHandler(io, gameManager) {
  io.on('connection', (socket) => {
    let currentGame = null;
    let currentToken = null;
    let playerNumber = null;

    /**
     * join-game now accepts { code, playerToken } from client.
     * playerToken is null for first join, set for reconnects.
     */
    socket.on('join-game', (data) => {
      // Support both old format (string) and new format (object)
      const code = typeof data === 'string' ? data : data.code;
      const clientToken = typeof data === 'string' ? null : (data.playerToken || null);

      const result = gameManager.joinGame(code, clientToken, socket.id);

      if (result.error) {
        socket.emit('error-msg', result.error);
        return;
      }

      const game = result.game;
      currentGame = code;
      currentToken = result.playerToken;
      playerNumber = result.playerNumber;
      socket.join(code);

      const playerCount = gameManager.getPlayerCount(code);

      // Send joined confirmation with the authoritative playerToken
      socket.emit('joined', {
        playerNumber,
        playerToken: result.playerToken,
        status: game.status,
        playerCount,
        maxPlayers: game.maxPlayers,
        isCreator: game.creatorToken === result.playerToken,
      });

      if (result.reconnect) {
        // Send full state sync so client can reconstruct the correct screen
        const state = gameManager.getGameState(code, currentToken);
        if (state) {
          socket.emit('game-state-sync', state);
        }
      }

      // Notify all players about updated count
      io.to(code).emit('player-count', {
        count: playerCount,
        max: game.maxPlayers,
      });

      // Auto-start if game is exactly full
      if (playerCount === game.maxPlayers && game.status === 'waiting') {
        startCountdown(code);
      }
    });

    socket.on('creator-start', () => {
      if (!currentGame || !currentToken) return;
      const game = gameManager.getGame(currentGame);
      if (!game) return;
      if (game.creatorToken !== currentToken) return;
      if (!gameManager.canStart(currentGame)) return;

      startCountdown(currentGame);
    });

    function startCountdown(code) {
      const game = gameManager.getGame(code);
      if (!game) return;

      gameManager.startCountdown(code);

      let count = 5;
      io.to(code).emit('countdown', count);

      game.countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
          io.to(code).emit('countdown', count);
        } else {
          clearInterval(game.countdownTimer);
          const gameData = gameManager.startPlaying(code);
          if (gameData) {
            io.to(code).emit('game-start', gameData);
          }
        }
      }, 1000);
    }

    socket.on('progress-update', (data) => {
      if (!currentGame) return;
      const game = gameManager.getGame(currentGame);
      if (!game) return;

      socket.to(currentGame).emit('player-progress', {
        playerNumber,
        matched: data.matched,
        total: game.words.length,
      });
    });

    socket.on('submit-answer', (data) => {
      if (!currentGame || !currentToken) return;

      const result = gameManager.submitAnswer(currentGame, currentToken, data.matches);
      if (!result) return;

      socket.to(currentGame).emit('player-finished', {
        playerNumber: result.playerNumber,
      });

      if (result.submissionCount === result.playerCount) {
        endGame(currentGame);
      } else if (result.submissionCount === 1) {
        const game = gameManager.getGame(currentGame);
        if (game) {
          game.finishTimeout = setTimeout(() => {
            endGame(currentGame);
          }, 30000);
        }
      }
    });

    function endGame(code) {
      const results = gameManager.endGame(code);
      if (results) {
        io.to(code).emit('game-over', results);
      }
    }

    socket.on('request-rematch', () => {
      if (!currentGame || !currentToken) return;

      const result = gameManager.addRematchVote(currentGame, currentToken);
      if (!result) return;

      if (result.rematchStarting) {
        io.to(currentGame).emit('rematch-start');
        startCountdown(currentGame);
      } else {
        socket.to(currentGame).emit('rematch-requested', {
          votes: result.votes,
          needed: result.needed,
        });
      }
    });

    socket.on('disconnect', () => {
      if (currentGame && currentToken) {
        gameManager.disconnectPlayer(currentGame, currentToken);
        socket.to(currentGame).emit('player-disconnected', { playerNumber });
      }
    });
  });
}

module.exports = setupSocketHandler;