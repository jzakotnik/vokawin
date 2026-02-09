const params = new URLSearchParams(window.location.search);
const gameCode = params.get('code');
if (!gameCode) window.location.href = '/';

// State
let socket = null;
let playerNumber = null;
let isCreator = false;
let maxPlayers = 2;
let words = [];
let leftOrder = [];
let rightOrder = [];
let selectedLeft = null;
let selectedRight = null;
let matches = [];
let timerInterval = null;
let startTime = null;
let gameLanguage = { source: 'de', target: 'en' };
let playerStatuses = {}; // playerNumber -> { matched, total, done }

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
  document.getElementById('copy-link-btn').textContent = i18n.t('lobby.copyLink');
  document.getElementById('lobby-waiting').innerHTML =
    i18n.t('lobby.waiting') + '<span class="dot-anim"></span>';
  document.getElementById('start-now-btn').textContent = i18n.t('lobby.startNow');
  document.getElementById('done-btn').textContent = i18n.t('game.done');
  document.getElementById('rematch-btn').textContent = i18n.t('results.rematch');
  document.getElementById('new-game-btn').textContent = i18n.t('results.newGame');

  // Column headers
  document.getElementById('col-left-header').textContent = i18n.langName(gameLanguage.source);
  document.getElementById('col-right-header').textContent = i18n.langName(gameLanguage.target);
}

function connectSocket() {
  socket = io();

  document.getElementById('game-code').textContent = gameCode;
  socket.emit('join-game', gameCode);

  socket.on('joined', (data) => {
    playerNumber = data.playerNumber;
    maxPlayers = data.maxPlayers;
    isCreator = data.isCreator;
    renderPlayerSlots(data.playerCount, maxPlayers);
    updateStartButton(data.playerCount);
  });

  socket.on('player-count', (data) => {
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
    words = data.words;
    leftOrder = data.leftOrder;
    rightOrder = data.rightOrder;
    selectedLeft = null;
    selectedRight = null;
    matches = [];
    playerStatuses = {};
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
    showToast(i18n.t(`error.${errorKey}`) || errorKey);
    setTimeout(() => window.location.href = '/', 2000);
  });

  // Copy link
  document.getElementById('copy-link-btn').addEventListener('click', () => {
    const url = `${window.location.origin}/game.html?code=${gameCode}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copy-link-btn');
      btn.textContent = i18n.t('lobby.copied');
      setTimeout(() => btn.textContent = i18n.t('lobby.copyLink'), 2000);
    }).catch(() => {
      showToast(i18n.t('lobby.copyFail'));
    });
  });

  // Creator start button
  document.getElementById('start-now-btn').addEventListener('click', () => {
    socket.emit('creator-start');
  });

  // Done button
  document.getElementById('done-btn').addEventListener('click', submitAnswer);

  // Rematch
  document.getElementById('rematch-btn').addEventListener('click', () => {
    socket.emit('request-rematch');
    document.getElementById('rematch-btn').textContent = i18n.t('results.rematchWaiting');
  });

  // New game
  document.getElementById('new-game-btn').addEventListener('click', () => {
    window.location.href = '/';
  });
}

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

function startGame() {
  showScreen('game');
  applyTranslations();

  // Render left column (source language)
  const leftCol = document.getElementById('left-col');
  leftCol.innerHTML = '';
  for (const idx of leftOrder) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = words[idx].source;
    card.dataset.wordIdx = idx;
    card.addEventListener('click', () => handleCardClick('left', idx, card));
    leftCol.appendChild(card);
  }

  // Render right column (target language)
  const rightCol = document.getElementById('right-col');
  rightCol.innerHTML = '';
  for (const idx of rightOrder) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = words[idx].target;
    card.dataset.wordIdx = idx;
    card.addEventListener('click', () => handleCardClick('right', idx, card));
    rightCol.appendChild(card);
  }

  // Timer
  startTime = Date.now();
  updateTimer();
  timerInterval = setInterval(updateTimer, 100);

  // Reset UI
  document.getElementById('match-count').textContent =
    i18n.t('game.matched', { count: 0, total: words.length });
  document.getElementById('done-btn').disabled = true;
  document.getElementById('done-btn').textContent = i18n.t('game.done');
  renderPlayersStatus();
}

function handleCardClick(side, wordIdx, card) {
  const existingMatch = matches.find(m =>
    (side === 'left' && m.leftIdx === wordIdx) ||
    (side === 'right' && m.rightIdx === wordIdx)
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

function createMatch(leftIdx, rightIdx) {
  const colorIdx = matches.length % 12;
  matches.push({ leftIdx, rightIdx, colorIdx });

  const leftCard = getCard('left', leftIdx);
  const rightCard = getCard('right', rightIdx);

  if (leftCard) {
    leftCard.classList.remove('selected');
    leftCard.className = `word-card matched-${colorIdx}`;
  }
  if (rightCard) {
    rightCard.classList.remove('selected');
    rightCard.className = `word-card matched-${colorIdx}`;
  }

  updateMatchCount();
  socket.emit('progress-update', { matched: matches.length });
}

function removeMatch(match) {
  matches = matches.filter(m => m !== match);

  const leftCard = getCard('left', match.leftIdx);
  const rightCard = getCard('right', match.rightIdx);
  if (leftCard) leftCard.className = 'word-card';
  if (rightCard) rightCard.className = 'word-card';

  matches.forEach((m, i) => {
    m.colorIdx = i % 12;
    const lc = getCard('left', m.leftIdx);
    const rc = getCard('right', m.rightIdx);
    if (lc) lc.className = `word-card matched-${m.colorIdx}`;
    if (rc) rc.className = `word-card matched-${m.colorIdx}`;
  });

  updateMatchCount();
  socket.emit('progress-update', { matched: matches.length });
}

function getCard(side, wordIdx) {
  const col = side === 'left' ? 'left-col' : 'right-col';
  return document.getElementById(col).querySelector(`[data-word-idx="${wordIdx}"]`);
}

function updateMatchCount() {
  document.getElementById('match-count').textContent =
    i18n.t('game.matched', { count: matches.length, total: words.length });
  document.getElementById('done-btn').disabled = matches.length < words.length;
}

function updateTimer() {
  const elapsed = (Date.now() - startTime) / 1000;
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
        total: status.total || words.length,
      });
    }
    container.appendChild(badge);
  }
}

function submitAnswer() {
  if (timerInterval) clearInterval(timerInterval);

  const submission = matches.map(m => ({
    leftIdx: m.leftIdx,
    rightIdx: m.rightIdx,
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

  // Score cards - ranked list
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
            ${i18n.t('game.player', { n: r.playerNumber })}
            ${isMe ? `<span class="you-badge">${i18n.t('results.you')}</span>` : ''}
          </div>
        </div>
        <div class="score">${r.correct}/${r.total}</div>
        <div class="detail">${r.timeTaken}s</div>
      </div>
    `;
  });

  cardsEl.innerHTML = cardsHtml;

  // Word results
  const wordsEl = document.getElementById('results-words');
  if (myResult && myResult.matches && myResult.matches.length > 0) {
    let html = `<h3>${i18n.t('results.yourAnswers')}</h3>`;
    for (const m of myResult.matches) {
      const correct = m.leftIdx === m.rightIdx;
      const word = data.words[m.leftIdx];
      const answered = data.words[m.rightIdx];
      html += `<div class="result-word-row ${correct ? 'correct' : 'wrong'}">
        <span>${word.source}</span>
        <span>${correct ? word.target : `<s>${answered.target}</s> → ${word.target}`}</span>
      </div>`;
    }
    wordsEl.innerHTML = html;
  } else {
    wordsEl.innerHTML = '';
  }
}

init();
