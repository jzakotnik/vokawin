let catalog = [];
let currentBook = null;
let wordlist = [];
let fromIndex = null;
let toIndex = null;
let wordCount = 10;
let maxPlayers = 2;

async function init() {
  await i18n.load(i18n.getLang());
  applyTranslations();
  setupLangToggle(applyTranslations);

  // Load catalog
  const catRes = await fetch('/api/catalog');
  catalog = await catRes.json();
  renderBookPicker();

  // Load first book
  if (catalog.length > 0) {
    await loadBook(catalog[0].id);
  }

  setupEvents();
}

function applyTranslations() {
  const t = i18n.t;
  document.getElementById('section-book-title').textContent = t('home.selectBook');
  document.getElementById('section-range-title').textContent = t('home.selectRange');
  document.getElementById('search-input').placeholder = t('home.searchPlaceholder');
  document.getElementById('section-count-title').textContent = t('home.wordsPerGame');
  document.getElementById('section-players-title').textContent = t('home.maxPlayers');
  document.getElementById('create-btn').textContent = t('home.createGame');
  document.getElementById('join-label').textContent = t('home.joinGame');
  document.getElementById('join-code').placeholder = t('home.enterCode');
  document.getElementById('join-btn').textContent = t('home.join');
  document.getElementById('from-label').textContent = t('home.rangeFrom');
  document.getElementById('to-label').textContent = t('home.rangeTo');
  document.getElementById('words-label').textContent = t('home.rangeWords');
  updateRangeDisplay();
  updateTagline();
}

function updateTagline() {
  const el = document.getElementById('tagline');
  if (el) el.textContent = i18n.t('app.tagline');
}

function renderBookPicker() {
  const select = document.getElementById('book-select');
  select.innerHTML = '';
  for (const book of catalog) {
    const opt = document.createElement('option');
    opt.value = book.id;
    opt.textContent = `${book.title} – ${book.subtitle || ''} (${book.wordCount})`;
    select.appendChild(opt);
  }
}

async function loadBook(bookId) {
  const res = await fetch(`/api/books/${bookId}`);
  const data = await res.json();
  currentBook = catalog.find(b => b.id === bookId);
  wordlist = data.words;
  fromIndex = null;
  toIndex = null;
  updateRangeDisplay();
  renderWordList();
}

function renderWordList(filter = '') {
  const browser = document.getElementById('word-browser');
  const lower = filter.toLowerCase();
  let html = '';

  for (let i = 0; i < wordlist.length; i++) {
    const w = wordlist[i];
    if (filter && !w.source.toLowerCase().includes(lower) && !w.target.toLowerCase().includes(lower)) {
      continue;
    }

    let cls = 'word-item';
    if (fromIndex !== null && toIndex !== null && i >= fromIndex && i <= toIndex) cls += ' in-range';
    if (i === fromIndex) cls += ' is-from';
    if (i === toIndex) cls += ' is-to';

    html += `<div class="${cls}" data-idx="${i}">
      <span class="word-num">${i + 1}</span>
      <span class="source">${w.source}</span>
      <span class="target">${w.target}</span>
    </div>`;
  }

  browser.innerHTML = html;
}

function updateRangeDisplay() {
  const t = i18n.t;
  const fromEl = document.getElementById('from-display');
  const toEl = document.getElementById('to-display');
  const countEl = document.getElementById('range-count');
  const btn = document.getElementById('create-btn');

  fromEl.textContent = fromIndex !== null ? wordlist[fromIndex].source : t('home.tapWord');
  toEl.textContent = toIndex !== null ? wordlist[toIndex].source : t('home.tapWord');

  if (fromIndex !== null && toIndex !== null) {
    const count = toIndex - fromIndex + 1;
    countEl.textContent = count;
    btn.disabled = count < wordCount;
  } else {
    countEl.textContent = '–';
    btn.disabled = true;
  }
}

function setupEvents() {
  // Book picker
  document.getElementById('book-select').addEventListener('change', (e) => {
    loadBook(e.target.value);
  });

  // Word browser clicks
  document.getElementById('word-browser').addEventListener('click', (e) => {
    const item = e.target.closest('.word-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx);

    if (fromIndex === null) {
      fromIndex = idx;
    } else if (toIndex === null) {
      if (idx <= fromIndex) {
        toIndex = fromIndex;
        fromIndex = idx;
      } else {
        toIndex = idx;
      }
    } else {
      fromIndex = idx;
      toIndex = null;
    }

    updateRangeDisplay();
    renderWordList(document.getElementById('search-input').value);
  });

  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    renderWordList(e.target.value);
  });

  // Word count picker
  document.querySelectorAll('.count-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.count-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      wordCount = parseInt(el.dataset.count);
      updateRangeDisplay();
    });
  });

  // Player count picker
  document.querySelectorAll('.player-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.player-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      maxPlayers = parseInt(el.dataset.players);
    });
  });

  // Create game
  document.getElementById('create-btn').addEventListener('click', createGame);

  // Join game
  document.getElementById('join-btn').addEventListener('click', joinGame);
  document.getElementById('join-code').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') joinGame();
  });
}

async function createGame() {
  const btn = document.getElementById('create-btn');
  btn.disabled = true;
  btn.textContent = i18n.t('home.creating');

  try {
    const res = await fetch('/api/create-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: currentBook.id,
        fromIndex,
        toIndex,
        wordCount,
        maxPlayers,
      }),
    });
    const data = await res.json();
    if (data.code) {
      window.location.href = `/game.html?code=${data.code}`;
    } else {
      showToast(data.error || i18n.t('error.network'));
      btn.disabled = false;
      btn.textContent = i18n.t('home.createGame');
    }
  } catch {
    showToast(i18n.t('error.network'));
    btn.disabled = false;
    btn.textContent = i18n.t('home.createGame');
  }
}

function joinGame() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length === 5) {
    window.location.href = `/game.html?code=${code}`;
  } else {
    showToast(i18n.t('home.codeError'));
  }
}

init();
