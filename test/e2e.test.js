const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
let proc;

const once = (sock, ev) => new Promise(res => sock.once(ev, res));
const post = (p, body) => fetch(URL + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async r => ({ status: r.status, body: await r.json() }));

test.before(async () => {
  proc = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    proc.stdout.on('data', d => String(d).includes('running') && res());
    proc.on('exit', c => rej(new Error('server exited ' + c)));
  });
});
test.after(() => proc.kill());

test('REST validation', async () => {
  const cat = await (await fetch(URL + '/api/catalog')).json();
  const id = cat[0].id;
  assert.strictEqual((await post('/api/create-game', {})).status, 400);
  assert.strictEqual((await post('/api/create-game', { bookId: id, fromIndex: -5, toIndex: 10, wordCount: 5 })).status, 400);
  assert.strictEqual((await post('/api/create-game', { bookId: id, fromIndex: 0, toIndex: 20, wordCount: '5' })).status, 400);
  assert.strictEqual((await post('/api/create-game', { bookId: id, fromIndex: 0, toIndex: 20, wordCount: 500 })).status, 400);
  assert.strictEqual((await fetch(URL + '/api/nope')).status, 404);
  assert.strictEqual((await fetch(URL + '/healthz')).status, 200);
  assert.ok((await fetch(URL + '/llms.txt')).ok);
});

test('full round with malformed input in between', async () => {
  const cat = await (await fetch(URL + '/api/catalog')).json();
  const created = await post('/api/create-game', { bookId: cat[0].id, fromIndex: 0, toIndex: 20, wordCount: 4, maxPlayers: 2 });
  assert.strictEqual(created.status, 200);
  const code = created.body.code;

  const a = io(URL); const b = io(URL);
  const aJoined = once(a, 'joined');
  a.emit('join-game', { code, playerToken: null });
  const ja = await aJoined;
  const gameStart = Promise.all([once(a, 'game-start'), once(b, 'game-start')]);
  b.emit('join-game', { code: code.toLowerCase() });

  // garbage that used to crash the process
  a.emit('join-game', null);
  a.emit('submit-answer');
  a.emit('progress-update', null);
  b.emit('submit-answer', { matches: 'nope' });
  b.emit('request-rematch'); // not finished yet -> ignored

  const [sa, sb] = await gameStart;
  assert.strictEqual(sa.left.length, 4);
  assert.ok(!('words' in sa) && !('leftOrder' in sa));

  // Find the right pairing through the DOM-free route: texts are enough for the test
  const ja2 = ja.playerNumber;
  assert.strictEqual(ja2, 1);

  const over = once(a, 'game-over');
  a.emit('submit-answer', { matches: [] });
  b.emit('submit-answer', { matches: [] });
  const res = await over;
  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.results[0].total, 4);

  // server still alive
  assert.strictEqual((await fetch(URL + '/healthz')).status, 200);
  a.close(); b.close();
});

test('reconnect restores state', async () => {
  const cat = await (await fetch(URL + '/api/catalog')).json();
  const { body } = await post('/api/create-game', { bookId: cat[0].id, fromIndex: 0, toIndex: 20, wordCount: 4, maxPlayers: 2 });
  const code = body.code;
  const a = io(URL); a.emit('join-game', { code });
  const j = await once(a, 'joined');
  const a2 = io(URL);
  a2.emit('join-game', { code, playerToken: j.playerToken });
  const sync = await once(a2, 'game-state-sync');
  assert.strictEqual(sync.status, 'waiting');
  assert.strictEqual(sync.playerNumber, 1);
  a.close(); a2.close();
});
