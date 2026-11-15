const test = require('node:test');
const assert = require('node:assert');
const GameManager = require('../server/gameManager');

const WORDS = Array.from({ length: 6 }, (_, i) => ({ source: `s${i}`, target: `t${i}` }));

function setup({ maxPlayers = 2 } = {}) {
  const gm = new GameManager();
  const events = [];
  gm.setHooks({
    gameStart: (code, data) => events.push(['start', data]),
    gameOver: (code, res) => events.push(['over', res]),
  });
  const game = gm.createGame({ bookId: 'b', wordCount: 4, maxPlayers, words: WORDS });
  return { gm, game, events };
}

function startRound(gm, game, n = 2) {
  const players = [];
  for (let i = 0; i < n; i++) players.push(gm.joinGame(game.code, null, `sock${i}`));
  game.status = 'countdown';
  gm.startPlaying(game.code);
  return players;
}

/** Build the correct match list from the server's private key (test only). */
function correctMatches(game) {
  return [...game.round.answer].map(([left, right]) => ({ left, right }));
}

test('createGame validates word count', () => {
  const gm = new GameManager();
  assert.throws(() => gm.createGame({ bookId: 'b', wordCount: 1, words: WORDS }));
  assert.throws(() => gm.createGame({ bookId: 'b', wordCount: 99, words: WORDS }));
  assert.throws(() => gm.createGame({ bookId: 'b', wordCount: 3.5, words: WORDS }));
  gm.destroy();
});

test('start payload does not reveal the pairing', () => {
  const { gm, game, events } = setup();
  startRound(gm, game);
  const payload = events.find(e => e[0] === 'start')[1];
  const ids = [...payload.left, ...payload.right].map(i => i.id);
  assert.strictEqual(new Set(ids).size, ids.length); // all ids unique -> no shared index
  assert.deepStrictEqual(Object.keys(payload.left[0]).sort(), ['id', 'text']);
  gm.destroy();
});

test('scoring ignores duplicates and unknown ids', () => {
  const { gm, game } = setup();
  const [p1] = startRound(gm, game);
  const one = correctMatches(game)[0];
  const spam = Array.from({ length: 50 }, () => one);
  gm.submitAnswer(game.code, p1.playerToken, [...spam, { left: 'x', right: 'y' }, null, 5]);
  const res = gm.endGame(game.code);
  const mine = res.results.find(r => r.playerNumber === 1);
  assert.strictEqual(mine.correct, 1);
  assert.strictEqual(mine.total, 4);
  gm.destroy();
});

test('malformed submissions never throw', () => {
  const { gm, game } = setup();
  const [p1] = startRound(gm, game);
  for (const bad of [undefined, null, 'x', 5, {}, [[]], [{ left: {}, right: [] }]]) {
    assert.doesNotThrow(() => gm.submitAnswer(game.code, p1.playerToken, bad));
  }
  gm.destroy();
});

test('round ends when all connected players submitted; perfect score counted', () => {
  const { gm, game, events } = setup();
  const [p1, p2] = startRound(gm, game);
  gm.submitAnswer(game.code, p1.playerToken, correctMatches(game));
  assert.strictEqual(game.status, 'playing');
  gm.submitAnswer(game.code, p2.playerToken, []);
  assert.strictEqual(game.status, 'finished');
  const over = events.find(e => e[0] === 'over')[1];
  assert.strictEqual(over.results[0].playerNumber, 1);
  assert.strictEqual(over.results[0].correct, 4);
  gm.destroy();
});

test('disconnected player does not block the round and gets partial score', () => {
  const { gm, game } = setup();
  const [p1, p2] = startRound(gm, game);
  const some = correctMatches(game).slice(0, 2);
  gm.updateProgress(game.code, p2.playerToken, some);
  gm.disconnectPlayer(game.code, p2.playerToken, 'sock1');
  gm.submitAnswer(game.code, p1.playerToken, correctMatches(game));
  assert.strictEqual(game.status, 'finished');
  const p2res = game.lastResults.results.find(r => r.playerNumber === 2);
  assert.strictEqual(p2res.correct, 2);
  gm.destroy();
});

test('stale socket disconnect does not mark a re-attached player offline', () => {
  const { gm, game } = setup();
  const [p1] = startRound(gm, game);
  gm.joinGame(game.code, p1.playerToken, 'newSocket');
  const r = gm.disconnectPlayer(game.code, p1.playerToken, 'sock0');
  assert.strictEqual(r.ignored, true);
  assert.strictEqual(game.players[p1.playerToken].connected, true);
  gm.destroy();
});

test('rematch only works after the round finished and needs a majority', () => {
  const { gm, game } = setup();
  const [p1, p2] = startRound(gm, game);
  assert.strictEqual(gm.addRematchVote(game.code, p1.playerToken), null); // still playing
  gm.endGame(game.code);
  assert.strictEqual(gm.addRematchVote(game.code, p1.playerToken).rematchStarting, false);
  assert.strictEqual(gm.addRematchVote(game.code, p2.playerToken).rematchStarting, true);
  assert.strictEqual(game.status, 'countdown');
  gm.destroy();
});

test('lobby: capacity, numbering, creator hand-over', () => {
  const { gm, game } = setup({ maxPlayers: 3 });
  const a = gm.joinGame(game.code, null, 's1');
  const b = gm.joinGame(game.code, null, 's2');
  assert.strictEqual(a.playerNumber, 1);
  assert.strictEqual(game.creatorToken, a.playerToken);
  let handedTo = null;
  gm.setHooks({ creatorChanged: (code, sid) => { handedTo = sid; } });
  gm.disconnectPlayer(game.code, a.playerToken, 's1');
  gm.removePlayer(game.code, a.playerToken); // grace period elapsed
  assert.strictEqual(game.creatorToken, b.playerToken);
  assert.strictEqual(handedTo, 's2');
  const c = gm.joinGame(game.code, null, 's3');
  assert.strictEqual(c.playerNumber, 1); // freed number is reused
  gm.joinGame(game.code, null, 's4');
  assert.strictEqual(gm.joinGame(game.code, null, 's5').error, 'gameFull');
  gm.destroy();
});

test('cannot join a running game; idle games are cleaned up', () => {
  const { gm, game } = setup({ maxPlayers: 3 });
  startRound(gm, game, 2);
  assert.strictEqual(gm.joinGame(game.code, null, 'late').error, 'gameInProgress');
  game.lastActivity = Date.now() - 2 * 60 * 60 * 1000;
  gm.cleanup();
  assert.strictEqual(gm.getGame(game.code), undefined);
  gm.destroy();
});
