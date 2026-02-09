function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function setupLangToggle(onSwitch) {
  const container = document.querySelector('.lang-toggle');
  if (!container) return;

  container.innerHTML = '';
  ['de', 'en'].forEach(lang => {
    const btn = document.createElement('button');
    btn.className = `lang-btn ${lang === i18n.getLang() ? 'active' : ''}`;
    btn.textContent = lang.toUpperCase();
    btn.addEventListener('click', async () => {
      await i18n.load(lang);
      container.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (onSwitch) onSwitch();
    });
    container.appendChild(btn);
  });
}