const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const GameManager = require('./gameManager');
const setupSocketHandler = require('./socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Load data
const dataDir = path.join(__dirname, '..', 'data');
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, 'catalog.json'), 'utf-8'));

const books = new Map();
for (const entry of catalog) {
  const filePath = path.join(dataDir, `${entry.id}.json`);
  if (fs.existsSync(filePath)) {
    const bookData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    books.set(entry.id, bookData);
  }
}

console.log(`Loaded ${books.size} book(s): ${[...books.keys()].join(', ')}`);

// Game manager
const gameManager = new GameManager();

// REST: get catalog
app.get('/api/catalog', (req, res) => {
  res.json(catalog);
});

// REST: get book words
app.get('/api/books/:id', (req, res) => {
  const book = books.get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(book);
});

// REST: create game
app.post('/api/create-game', (req, res) => {
  const { bookId, fromIndex, toIndex, wordCount, maxPlayers } = req.body;

  if (!bookId || fromIndex == null || toIndex == null || !wordCount) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const book = books.get(bookId);
  if (!book) return res.status(400).json({ error: 'Book not found' });

  const rangeWords = book.words.slice(fromIndex, toIndex + 1);
  if (rangeWords.length < wordCount) {
    return res.status(400).json({ error: 'Not enough words in range' });
  }

  try {
    const game = gameManager.createGame({
      bookId,
      fromIndex,
      toIndex,
      wordCount,
      maxPlayers: maxPlayers || 2,
      words: rangeWords,
    });

    // Find language info from catalog
    const catalogEntry = catalog.find(c => c.id === bookId);

    res.json({
      code: game.code,
      language: catalogEntry?.language || { source: 'de', target: 'en' },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// REST: game info (for joining players to get language info)
app.get('/api/game/:code', (req, res) => {
  const game = gameManager.getGame(req.params.code.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const catalogEntry = catalog.find(c => c.id === game.bookId);

  res.json({
    code: game.code,
    maxPlayers: game.maxPlayers,
    playerCount: Object.keys(game.players).length,
    status: game.status,
    language: catalogEntry?.language || { source: 'de', target: 'en' },
  });
});

// Socket.IO
setupSocketHandler(io, gameManager);

// Serve llms.txt
app.get('/llms.txt', (req, res) => {
  res.type('text/plain').sendFile(path.join(__dirname, '..', 'public', 'llms.txt'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`VokaWin running on http://localhost:${PORT}`);
});
