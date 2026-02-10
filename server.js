const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Load wordlist
const wordlist = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public', 'wordlist.json'), 'utf-8')
);

// In-memory game store
const games = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// REST: create game
app.post('/api/create-game', (req, res) => {
  const { fromIndex, toIndex, wordCount } = req.body;

  if (fromIndex == null || toIndex == null || !wordCount) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const rangeWords = wordlist.slice(fromIndex, toIndex + 1);
  if (rangeWords.length < wordCount) {
    return res.status(400).json({ error: 'Not enough words in range' });
  }

  // Pick random words from range
  const selected = shuffleArray(rangeWords).slice(0, wordCount);

  // Generate shuffled columns
  const leftOrder = shuffleArray(selected.map((w, i) => i));
  const rightOrder = shuffleArray(selected.map((w, i) => i));

  let code;
  do { code = generateCode(); } while (games.has(code));

  games.set(code, {
    words: selected,
    leftOrder,
    rightOrder,
    players: {},
    status: 'waiting',
    submissions: {},
    createdAt: Date.now(),
    countdownTimer: null,
  });

  res.json({ code });
});

// Cleanup old games every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games) {
    if (now - game.createdAt > 60 * 60 * 1000) {
      games.delete(code);
    }
  }
}, 10 * 60 * 1000);

// Socket.IO
io.on('connection', (socket) => {
  let currentGame = null;
  let playerNumber = null;

  socket.on('join-game', (code) => {
    const game = games.get(code);
    if (!game) {
      socket.emit('error-msg', 'Game not found.');
      return;
    }

    const playerIds = Object.keys(game.players);

    if (playerIds.length >= 2 && !game.players[socket.id]) {
      socket.emit('error-msg', 'Game is full.');
      return;
    }

    // Reconnect or join
    if (!game.players[socket.id]) {
      playerNumber = playerIds.length + 1;
      game.players[socket.id] = { number: playerNumber, connected: true };
    } else {
      playerNumber = game.players[socket.id].number;
      game.players[socket.id].connected = true;
    }

    currentGame = code;
    socket.join(code);

    socket.emit('joined', {
      playerNumber,
      status: game.status,
      playerCount: Object.keys(game.players).length,
    });

    const playerCount = Object.keys(game.players).length;

    if (playerCount === 2 && game.status === 'waiting') {
      game.status = 'countdown';
      io.to(code).emit('player-count', 2);
      startCountdown(code);
    } else {
      socket.emit('player-count', playerCount);
    }
  });

  function startCountdown(code) {
    const game = games.get(code);
    if (!game) return;

    let count = 5;
    io.to(code).emit('countdown', count);

    game.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        io.to(code).emit('countdown', count);
      } else {
        clearInterval(game.countdownTimer);
        game.status = 'playing';
        game.startTime = Date.now();
        io.to(code).emit('game-start', {
          words: game.words,
          leftOrder: game.leftOrder,
          rightOrder: game.rightOrder,
        });
      }
    }, 1000);
  }

  socket.on('progress-update', (data) => {
    if (!currentGame) return;
    socket.to(currentGame).emit('opponent-progress', data);
  });

  socket.on('submit-answer', (data) => {
    const game = games.get(currentGame);
    if (!game || game.status !== 'playing') return;

    const timeTaken = (Date.now() - game.startTime) / 1000;

    // data.matches = [{ leftIdx, rightIdx }, ...]
    // Validate: count correct matches
    let correct = 0;
    for (const match of data.matches) {
      if (match.leftIdx === match.rightIdx) {
        correct++;
      }
    }

    game.submissions[socket.id] = {
      playerNumber: game.players[socket.id].number,
      correct,
      total: game.words.length,
      timeTaken: Math.round(timeTaken * 10) / 10,
      matches: data.matches,
    };

    // Notify opponent that this player finished
    socket.to(currentGame).emit('opponent-finished');

    // Check if both submitted or first finisher triggers end
    const subs = Object.values(game.submissions);
    if (subs.length === 2) {
      endGame(currentGame);
    } else {
      // Give opponent 30 seconds to finish
      game.finishTimeout = setTimeout(() => {
        endGame(currentGame);
      }, 30000);
    }
  });

  function endGame(code) {
    const game = games.get(code);
    if (!game || game.status === 'finished') return;

    game.status = 'finished';
    if (game.finishTimeout) clearTimeout(game.finishTimeout);

    const results = Object.values(game.submissions);

    // If only one submitted, the other gets 0
    const playerIds = Object.keys(game.players);
    for (const pid of playerIds) {
      if (!game.submissions[pid]) {
        results.push({
          playerNumber: game.players[pid].number,
          correct: 0,
          total: game.words.length,
          timeTaken: 30,
          matches: [],
        });
      }
    }

    // Determine winner
    results.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.timeTaken - b.timeTaken;
    });

    io.to(code).emit('game-over', {
      results,
      words: game.words,
    });
  }

  socket.on('request-rematch', () => {
    const game = games.get(currentGame);
    if (!game) return;

    if (!game.rematchVotes) game.rematchVotes = new Set();
    game.rematchVotes.add(socket.id);

    socket.to(currentGame).emit('rematch-requested');

    if (game.rematchVotes.size === 2) {
      // Reset game
      const rangeWords = game.words;
      const selected = shuffleArray(rangeWords);
      game.words = selected;
      game.leftOrder = shuffleArray(selected.map((_, i) => i));
      game.rightOrder = shuffleArray(selected.map((_, i) => i));
      game.status = 'countdown';
      game.submissions = {};
      game.rematchVotes = null;

      io.to(currentGame).emit('rematch-start');
      startCountdown(currentGame);
    }
  });

  socket.on('disconnect', () => {
    if (currentGame) {
      const game = games.get(currentGame);
      if (game && game.players[socket.id]) {
        game.players[socket.id].connected = false;
        socket.to(currentGame).emit('opponent-disconnected');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`VokaWin running on http://localhost:${PORT}`);
});
