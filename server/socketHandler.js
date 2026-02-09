function setupSocketHandler(io, gameManager) {
  io.on('connection', (socket) => {
    let currentGame = null;
    let playerNumber = null;

    socket.on('join-game', (code) => {
      const result = gameManager.joinGame(code, socket.id);

      if (result.error) {
        socket.emit('error-msg', result.error);
        return;
      }

      const game = result.game;
      currentGame = code;
      playerNumber = result.playerNumber;
      socket.join(code);

      const playerCount = gameManager.getPlayerCount(code);

      socket.emit('joined', {
        playerNumber,
        status: game.status,
        playerCount,
        maxPlayers: game.maxPlayers,
        isCreator: game.creatorId === socket.id,
      });

      // Notify all players about updated count
      io.to(code).emit('player-count', {
        count: playerCount,
        max: game.maxPlayers,
      });

      // Auto-start if game is exactly full (maxPlayers reached)
      if (playerCount === game.maxPlayers && game.status === 'waiting') {
        startCountdown(code);
      }
    });

    // Creator manually starts with fewer than max players
    socket.on('creator-start', () => {
      if (!currentGame) return;
      const game = gameManager.getGame(currentGame);
      if (!game) return;
      if (game.creatorId !== socket.id) return;
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

      // Broadcast to all OTHER players
      socket.to(currentGame).emit('player-progress', {
        playerNumber,
        matched: data.matched,
        total: game.words.length,
      });
    });

    socket.on('submit-answer', (data) => {
      if (!currentGame) return;

      const result = gameManager.submitAnswer(currentGame, socket.id, data.matches);
      if (!result) return;

      // Notify others that this player finished
      socket.to(currentGame).emit('player-finished', {
        playerNumber: result.playerNumber,
      });

      // All submitted? End game immediately
      if (result.submissionCount === result.playerCount) {
        endGame(currentGame);
      } else if (result.submissionCount === 1) {
        // First finisher → give others 30 seconds
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
      if (!currentGame) return;

      const result = gameManager.addRematchVote(currentGame, socket.id);
      if (!result) return;

      if (result.rematchStarting) {
        io.to(currentGame).emit('rematch-start');
        startCountdown(currentGame);
      } else {
        // Notify others about the vote
        socket.to(currentGame).emit('rematch-requested', {
          votes: result.votes,
          needed: result.needed,
        });
      }
    });

    socket.on('disconnect', () => {
      if (currentGame) {
        gameManager.disconnectPlayer(currentGame, socket.id);
        socket.to(currentGame).emit('player-disconnected', { playerNumber });
      }
    });
  });
}

module.exports = setupSocketHandler;
