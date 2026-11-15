const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameManager = require('./gameManager');
const setupSocketHandler = require('./socketHandler');
const { loadBooks } = require('./catalog');
const { isInt } = require('./utils');

const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, '..', 'data');

// ---------- data ----------

let catalog, books;
try {
  const loaded = loadBooks(dataDir);
  catalog = loaded.catalog;
  books = loaded.books;
  for (const problem of loaded.problems) console.error(`[data] ${problem}`);
  if (books.size === 0) throw new Error('no playable book found in data/');
} catch (err) {
  console.error(`[data] ${err.message}`);
  process.exit(1);
}
console.log(`Loaded ${books.size} book(s): ${[...books.keys()].join(', ')}`);

const catalogById = new Map(catalog.map(c => [c.id, c]));
const languageOf = (bookId) => catalogById.get(bookId)?.language || { source: 'de', target: 'en' };

// ---------- app ----------

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Tolerant ping settings for mobile standby
  pingInterval: 25000,
  pingTimeout: 30000,
  maxHttpBufferSize: 1e5,
});

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json({ limit: '10kb' }));

const gameManager = new GameManager();

// Minimal in-memory rate limiter (per IP) for game creation.
const createHits = new Map();
const CREATE_LIMIT = 20;
const CREATE_WINDOW_MS = 60 * 1000;
function createRateLimit(req, res, next) {
  const now = Date.now();
  const hits = (createHits.get(req.ip) || []).filter(t => now - t < CREATE_WINDOW_MS);
  if (hits.length >= CREATE_LIMIT) return res.status(429).json({ error: 'rateLimited' });
  hits.push(now);
  createHits.set(req.ip, hits);
  next();
}
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of createHits) {
    if (hits.every(t => now - t >= CREATE_WINDOW_MS)) createHits.delete(ip);
  }
}, CREATE_WINDOW_MS);
rateLimitCleanup.unref();

app.get('/healthz', (req, res) => res.json({ ok: true, games: gameManager.games.size }));

app.get('/api/catalog', (req, res) => res.json(catalog));

app.get('/api/books/:id', (req, res) => {
  const book = books.get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(book);
});

app.post('/api/create-game', createRateLimit, (req, res) => {
  const body = req.body || {};
  const { bookId, fromIndex, toIndex, wordCount } = body;
  const maxPlayers = body.maxPlayers == null ? 2 : body.maxPlayers;

  const book = typeof bookId === 'string' ? books.get(bookId) : null;
  if (!book) return res.status(400).json({ error: 'Book not found' });

  if (![fromIndex, toIndex, wordCount, maxPlayers].every(isInt)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  if (fromIndex < 0 || toIndex < fromIndex || toIndex >= book.words.length) {
    return res.status(400).json({ error: 'Invalid word range' });
  }

  const rangeWords = book.words.slice(fromIndex, toIndex + 1);
  if (rangeWords.length < wordCount) {
    return res.status(400).json({ error: 'Not enough words in range' });
  }

  try {
    const game = gameManager.createGame({ bookId, wordCount, maxPlayers, words: rangeWords });
    res.json({ code: game.code, language: languageOf(bookId) });
  } catch (err) {
    const status = err.message === 'serverBusy' ? 503 : 400;
    res.status(status).json({ error: err.message });
  }
});

app.get('/api/game/:code', (req, res) => {
  const game = gameManager.getGame(String(req.params.code).toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });

  res.json({
    code: game.code,
    maxPlayers: game.maxPlayers,
    playerCount: Object.keys(game.players).length,
    status: game.status,
    language: languageOf(game.bookId),
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// JSON error handler (malformed bodies etc.)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal error' : 'Bad request' });
});

setupSocketHandler(io, gameManager);

// ---------- start / shutdown ----------

server.listen(PORT, () => {
  console.log(`VokaWin running on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  gameManager.destroy();
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
