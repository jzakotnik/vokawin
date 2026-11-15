const params = new URLSearchParams(window.location.search);
const gameCode = params.get('code');
if (!gameCode) window.location.href = '/';

// --- State ---
let socket = null;
let playerNumber = null;
let playerToken = null; // Fix 1: persistent identity
let isCreator = false;
let maxPlayers = 2;
let leftItems = [];   // [{ id, text }] shuffled by server
let rightItems = [];
let selectedLeft = null;
let selectedRight = null;
let matches = [];
let timerInterval = null;
let startTimeLocal = null;  // local timestamp the round started (server elapsed applied)
let gameLanguage = { source: 'de', target: 'en' };
let playerStatuses = {};
let hasSubmitted = false;
let playersInLobby = 0;

// Fix 1: Restore token from sessionStorage if we had one for this game
const storageKey = `vokawin-token-${gameCode}`;
playerToken = sessionStorage.getItem(storageKey) || null;

async function init() {
  await i18n.load(i18n.getLang());
  setupLangToggle(applyTranslations);

  // Get game info for language
  try {
    const res = await fetch(`/api/game/${gameCode}`);
    if (res.ok) {
      const info = await res.json();
      gameLanguage = info.language || gameLanguage;
      maxPlayers = info.maxPlayers || 2;
    }
  } catch {}

  applyTranslations();
  connectSocket();
}

function applyTranslations() {
  document.getElementById('lobby-share-text').textContent = i18n.t('lobby.shareCode');
  document.getElementById('copy-link-btn').textContent = shareButtonLabel();
  document.getElementById('lobby-waiting').innerHTML =
    i18n.t('lobby.waiting') + '<span class="dot-anim"></span>';
  document.getElementById('start-now-btn').textContent = i18n.t('lobby.startNow');
  document.getElementById('done-btn').textContent = i18n.t('game.done');
  document.getElementById('rematch-btn').textContent = i18n.t('results.rematch');
  document.getElementById('new-game-btn').textContent = i18n.t('results.newGame');

  document.getElementById('col-left-header').textContent = i18n.langName(gameLanguage.source);
  document.getElementById('col-right-header').textContent = i18n.langName(gameLanguage.target);
}

function connectSocket() {
  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });

  document.getElementById('game-code').textContent = gameCode;

  // --- Fix 2: Re-join on every (re)connect ---
  socket.on('connect', () => {
    hideConnectionBanner();
    socket.emit('join-game', {
      code: gameCode,
      playerToken: playerToken,
    });
  });

  socket.on('disconnect', () => {
    showConnectionBanner();
  });

  // --- Socket events ---

  socket.on('joined', (data) => {
    playerNumber = data.playerNumber;
    maxPlayers = data.maxPlayers;
    isCreator = data.isCreator;

    // Fix 1: Store the server-assigned token
    if (data.playerToken) {
      playerToken = data.playerToken;
      sessionStorage.setItem(storageKey, playerToken);
    }

    playersInLobby = data.playerCount;
    renderPlayerSlots(data.playerCount, maxPlayers);
    updateStartButton(data.playerCount);
  });

  // --- Fix 3: Full state sync on reconnect ---
  socket.on('game-state-sync', (state) => {
    playerNumber = state.playerNumber;
    maxPlayers = state.maxPlayers;
    isCreator = state.isCreator;

    if (state.status === 'waiting') {
      showScreen('lobby');
      renderPlayerSlots(state.playerCount, state.maxPlayers);
      updatePlayerCountText(state.playerCount, state.maxPlayers);
      updateStartButton(state.playerCount);

    } else if (state.status === 'countdown') {
      // Countdown is transient — just show countdown screen
      // The server's ongoing countdown will send ticks
      showScreen('countdown');

    } else if (state.status === 'playing') {
      leftItems = state.left;
      rightItems = state.right;
      startTimeLocal = Date.now() - (state.elapsedMs || 0);
      hasSubmitted = state.hasSubmitted;
      selectedLeft = null;
      selectedRight = null;
      matches = [];

      // Rebuild player statuses from server data
      playerStatuses = {};
      if (state.submittedPlayers) {
        for (const pNum of state.submittedPlayers) {
          if (pNum !== playerNumber) {
            playerStatuses[pNum] = { matched: 0, total: leftItems.length, done: true };
          }
        }
      }

      startGame();
      // The server keeps our latest matches, so a reload does not lose them
      for (const m of state.matches || []) createMatch(m.left, m.right, { silent: true });
      if (hasSubmitted) {
        document.getElementById('done-btn').disabled = true;
        document.getElementById('done-btn').textContent = i18n.t('game.waitingForOthers');
      }

    } else if (state.status === 'finished' && state.results) {
      showResults(state.results);
    }
  });

  socket.on('creator-changed', () => {
    isCreator = true;
    updateStartButton(playersInLobby);
  });

  socket.on('player-reconnected', () => {
    showToast(i18n.t('error.playerReconnected'));
  });

  socket.on('player-count', (data) => {
    playersInLobby = data.count;
    renderPlayerSlots(data.count, data.max);
    updatePlayerCountText(data.count, data.max);
    updateStartButton(data.count);
  });

  socket.on('countdown', (num) => {
    showScreen('countdown');
    const el = document.getElementById('countdown-num');
    el.textContent = num;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'countPulse 0.5s ease-out';
  });

  socket.on('game-start', (data) => {
    leftItems = data.left;
    rightItems = data.right;
    startTimeLocal = Date.now();
    selectedLeft = null;
    selectedRight = null;
    matches = [];
    playerStatuses = {};
    hasSubmitted = false;
    startGame();
  });

  socket.on('player-progress', (data) => {
    playerStatuses[data.playerNumber] = {
      matched: data.matched,
      total: data.total,
      done: false,
    };
    renderPlayersStatus();
  });

  socket.on('player-finished', (data) => {
    playerStatuses[data.playerNumber] = {
      ...playerStatuses[data.playerNumber],
      done: true,
    };
    renderPlayersStatus();
  });

  socket.on('game-over', (data) => {
    showResults(data);
  });

  socket.on('rematch-requested', (data) => {
    document.getElementById('rematch-btn').textContent =
      i18n.t('results.rematchAccept') + ` (${data.votes}/${data.needed})`;
  });

  socket.on('rematch-start', () => {
    document.getElementById('rematch-btn').textContent = i18n.t('results.rematch');
  });

  socket.on('player-disconnected', () => {
    showToast(i18n.t('error.disconnected'));
  });

  socket.on('error-msg', (errorKey) => {
    const key = `error.${errorKey}`;
    const text = i18n.t(key);
    showToast(text !== key ? text : String(errorKey));
    setTimeout(() => window.location.href = '/', 2000);
  });

  // --- Button handlers (bound once) ---

  // Share/Copy link with native share support
  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    const url = `${window.location.origin}/game.html?code=${gameCode}`;
    const btn = document.getElementById('copy-link-btn');

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VokaWin',
          text: i18n.t('lobby.shareMessage', { code: gameCode }),
          url,
        });
      } catch (err) {
        if (err.name !== 'AbortError') fallbackToCopy(url, btn);
      }
    } else {
      fallbackToCopy(url, btn);
    }
  });

  document.getElementById('start-now-btn').addEventListener('click', () => {
    socket.emit('creator-start');
  });

  document.getElementById('done-btn').addEventListener('click', submitAnswer);

  document.getElementById('rematch-btn').addEventListener('click', () => {
    socket.emit('request-rematch');
    document.getElementById('rematch-btn').textContent = i18n.t('results.rematchWaiting');
  });

  document.getElementById('new-game-btn').addEventListener('click', () => {
    sessionStorage.removeItem(storageKey);
    window.location.href = '/';
  });

  // --- Fix 4: Visibility API — reconnect when phone wakes up ---
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!socket.connected) {
        socket.connect();
      } else {
        // Already connected but may have missed events during standby
        socket.emit('join-game', {
          code: gameCode,
          playerToken: playerToken,
        });
      }
    }
  });
}

// --- Connection status banner ---

function fallbackToCopy(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = i18n.t('lobby.copied');
    setTimeout(() => { btn.textContent = shareButtonLabel(); }, 2000);
  }).catch(() => {
    showToast(i18n.t('lobby.copyFail'));
  });
}

function shareButtonLabel() {
  return navigator.share ? i18n.t('lobby.shareLink') : i18n.t('lobby.copyLink');
}

function showConnectionBanner() {
  let banner = document.getElementById('connection-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'connection-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: var(--red, #f87171); color: #fff;
      text-align: center; padding: 8px; font-size: 0.85rem;
      font-weight: 600; z-index: 300;
    `;
    document.body.appendChild(banner);
  }
  banner.textContent = i18n.t('error.connectionLost');
  banner.style.display = 'block';
}

function hideConnectionBanner() {
  const banner = document.getElementById('connection-banner');
  if (banner) banner.style.display = 'none';
}

// --- Screen management ---

function renderPlayerSlots(count, max) {
  const container = document.getElementById('player-slots');
  container.innerHTML = '';
  for (let i = 1; i <= max; i++) {
    const slot = document.createElement('div');
    slot.className = `player-slot ${i <= count ? 'filled' : ''}`;
    slot.textContent = i <= count ? `P${i}` : '';
    container.appendChild(slot);
  }
}

function updatePlayerCountText(count, max) {
  document.getElementById('player-count-text').textContent =
    i18n.t('lobby.playersJoined', { count, max });
}

function updateStartButton(playerCount) {
  const btn = document.getElementById('start-now-btn');
  if (isCreator && playerCount >= 2 && playerCount < maxPlayers) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function showScreen(name) {
  ['lobby', 'countdown', 'game', 'results'].forEach(s => {
    document.getElementById('screen-' + s).classList.toggle('hidden', s !== name);
  });
}

// --- Game board ---

function startGame() {
  showScreen('game');
  applyTranslations();

  const leftCol = document.getElementById('left-col');
  leftCol.innerHTML = '';
  for (const item of leftItems) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = item.text;
    card.dataset.wordIdx = item.id;
    card.addEventListener('click', () => handleCardClick('left', item.id, card));
    leftCol.appendChild(card);
  }

  const rightCol = document.getElementById('right-col');
  rightCol.innerHTML = '';
  for (const item of rightItems) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = item.text;
    card.dataset.wordIdx = item.id;
    card.addEventListener('click', () => handleCardClick('right', item.id, card));
    rightCol.appendChild(card);
  }

  // Fix 3: Timer based on authoritative server time
  if (timerInterval) clearInterval(timerInterval);
  updateTimer();
  timerInterval = setInterval(updateTimer, 100);

  document.getElementById('match-count').textContent =
    i18n.t('game.matched', { count: 0, total: leftItems.length });
  document.getElementById('done-btn').disabled = true;
  document.getElementById('done-btn').textContent = i18n.t('game.done');
  renderPlayersStatus();
}

function handleCardClick(side, wordIdx, card) {
  if (hasSubmitted) return; // can't change after submitting

  const existingMatch = matches.find(m =>
    (side === 'left' && m.leftId === wordIdx) ||
    (side === 'right' && m.rightId === wordIdx)
  );

  if (existingMatch) {
    removeMatch(existingMatch);
    return;
  }

  if (side === 'left') {
    if (selectedLeft !== null) {
      getCard('left', selectedLeft)?.classList.remove('selected');
    }
    if (selectedLeft === wordIdx) {
      selectedLeft = null;
      return;
    }
    selectedLeft = wordIdx;
    card.classList.add('selected');

    if (selectedRight !== null) {
      createMatch(selectedLeft, selectedRight);
      selectedLeft = null;
      selectedRight = null;
    }
  } else {
    if (selectedRight !== null) {
      getCard('right', selectedRight)?.classList.remove('selected');
    }
    if (selectedRight === wordIdx) {
      selectedRight = null;
      return;
    }
    selectedRight = wordIdx;
    card.classList.add('selected');

    if (selectedLeft !== null) {
      createMatch(selectedLeft, selectedRight);
      selectedLeft = null;
      selectedRight = null;
    }
  }
}

function createMatch(leftId, rightId, { silent = false } = {}) {
  const colorIdx = matches.length % 12;
  matches.push({ leftId, rightId, colorIdx });

  const leftCard = getCard('left', leftId);
  const rightCard = getCard('right', rightId);

  if (leftCard) {
    leftCard.classList.remove('selected');
    leftCard.className = `word-card matched-${colorIdx}`;
  }
  if (rightCard) {
    rightCard.classList.remove('selected');
    rightCard.className = `word-card matched-${colorIdx}`;
  }

  updateMatchCount();
  if (!silent) sendProgress();
}

function removeMatch(match) {
  matches = matches.filter(m => m !== match);

  const leftCard = getCard('left', match.leftId);
  const rightCard = getCard('right', match.rightId);
  if (leftCard) leftCard.className = 'word-card';
  if (rightCard) rightCard.className = 'word-card';

  matches.forEach((m, i) => {
    m.colorIdx = i % 12;
    const lc = getCard('left', m.leftId);
    const rc = getCard('right', m.rightId);
    if (lc) lc.className = `word-card matched-${m.colorIdx}`;
    if (rc) rc.className = `word-card matched-${m.colorIdx}`;
  });

  updateMatchCount();
  sendProgress();
}

function sendProgress() {
  socket.emit('progress-update', {
    matches: matches.map(m => ({ left: m.leftId, right: m.rightId })),
  });
}

function getCard(side, wordIdx) {
  const col = side === 'left' ? 'left-col' : 'right-col';
  return document.getElementById(col).querySelector(`[data-word-idx="${wordIdx}"]`);
}

function updateMatchCount() {
  document.getElementById('match-count').textContent =
    i18n.t('game.matched', { count: matches.length, total: leftItems.length });
  document.getElementById('done-btn').disabled = matches.length < leftItems.length;
}

function updateTimer() {
  // Fix 3: Use authoritative server start time
  if (!startTimeLocal) return;
  const elapsed = (Date.now() - startTimeLocal) / 1000;
  document.getElementById('timer').textContent = elapsed.toFixed(1) + 's';
}

function renderPlayersStatus() {
  const container = document.getElementById('players-status');
  container.innerHTML = '';

  for (const [pNum, status] of Object.entries(playerStatuses)) {
    if (parseInt(pNum) === playerNumber) continue;

    const badge = document.createElement('div');
    badge.className = `player-status-badge ${status.done ? 'done' : ''}`;

    if (status.done) {
      badge.textContent = i18n.t('game.playerDone', { n: pNum });
    } else {
      badge.textContent = i18n.t('game.playerProgress', {
        n: pNum,
        count: status.matched,
        total: status.total || leftItems.length,
      });
    }
    container.appendChild(badge);
  }
}

function submitAnswer() {
  if (timerInterval) clearInterval(timerInterval);
  hasSubmitted = true;

  const submission = matches.map(m => ({
    left: m.leftId,
    right: m.rightId,
  }));

  socket.emit('submit-answer', { matches: submission });
  document.getElementById('done-btn').disabled = true;
  document.getElementById('done-btn').textContent = i18n.t('game.waitingForOthers');
}

function showResults(data) {
  if (timerInterval) clearInterval(timerInterval);
  showScreen('results');

  const myResult = data.results.find(r => r.playerNumber === playerNumber);
  const myRank = data.results.indexOf(myResult) + 1;
  const totalPlayers = data.results.length;

  const icon = document.getElementById('result-icon');
  const title = document.getElementById('result-title');
  const subtitle = document.getElementById('result-subtitle');

  if (myRank === 1 && totalPlayers > 1 && myResult.correct > 0) {
    icon.textContent = '🏆';
    title.textContent = i18n.t('results.youWin');
    subtitle.textContent = i18n.t('results.correctIn', {
      correct: myResult.correct,
      total: myResult.total,
      time: myResult.timeTaken,
    });
  } else if (myRank === 1 && totalPlayers > 1) {
    icon.textContent = '🤝';
    title.textContent = i18n.t('results.draw');
    subtitle.textContent = '';
  } else if (myRank <= Math.ceil(totalPlayers / 2)) {
    icon.textContent = '💪';
    title.textContent = i18n.t('results.place', { n: myRank });
    subtitle.textContent = i18n.t('results.correctIn', {
      correct: myResult.correct,
      total: myResult.total,
      time: myResult.timeTaken,
    });
  } else {
    icon.textContent = '😤';
    title.textContent = i18n.t('results.place', { n: myRank });
    subtitle.textContent = i18n.t('results.correctIn', {
      correct: myResult.correct,
      total: myResult.total,
      time: myResult.timeTaken,
    });
  }

  const cardsEl = document.getElementById('score-cards');
  const rankIcons = ['🥇', '🥈', '🥉'];
  let cardsHtml = '';

  data.results.forEach((r, i) => {
    const isMe = r.playerNumber === playerNumber;
    const isWinner = i === 0 && r.correct > 0;
    const rankIcon = rankIcons[i] || `#${i + 1}`;

    cardsHtml += `
      <div class="score-card ${isWinner ? 'winner' : ''} ${isMe ? 'is-me' : ''}">
        <div class="rank">${rankIcon}</div>
        <div class="player-info">
          <div class="player-label">
            ${escapeHtml(i18n.t('game.player', { n: r.playerNumber }))}
            ${isMe ? `<span class="you-badge">${i18n.t('results.you')}</span>` : ''}
          </div>
        </div>
        <div class="score">${Number(r.correct)}/${Number(r.total)}</div>
        <div class="detail">${Number(r.timeTaken)}s</div>
      </div>
    `;
  });

  cardsEl.innerHTML = cardsHtml;

  const wordsEl = document.getElementById('results-words');
  if (myResult && myResult.matches && myResult.matches.length > 0) {
    let html = `<h3>${escapeHtml(i18n.t('results.yourAnswers'))}</h3>`;
    for (const m of myResult.matches) {
      html += `<div class="result-word-row ${m.ok ? 'correct' : 'wrong'}">
        <span>${escapeHtml(m.source)}</span>
        <span>${m.ok ? escapeHtml(m.expected) : `<s>${escapeHtml(m.answered)}</s> → ${escapeHtml(m.expected)}`}</span>
      </div>`;
    }
    wordsEl.innerHTML = html;
  } else {
    wordsEl.innerHTML = '';
  }
}

init();