const i18n = (() => {
  let strings = {};
  let currentLang = localStorage.getItem('vokawin-lang') || 'de';

  async function load(lang) {
    try {
      const res = await fetch(`/i18n/${lang}.json`);
      strings = await res.json();
      currentLang = lang;
      localStorage.setItem('vokawin-lang', lang);
    } catch {
      console.warn(`Failed to load language: ${lang}`);
    }
  }

  function t(key, vars = {}) {
    let str = strings[key] || key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return str;
  }

  function getLang() {
    return currentLang;
  }

  function langName(code) {
    return t(`lang.${code}`) || code.toUpperCase();
  }

  return { load, t, getLang, langName };
})();
