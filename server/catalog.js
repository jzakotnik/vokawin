const fs = require('fs');
const path = require('path');

const ID_RE = /^[A-Za-z0-9_-]+$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot read ${file}: ${err.message}`);
  }
}

/**
 * Load catalog.json and every book it references.
 * - A broken catalog.json is fatal (throws, naming the file).
 * - A missing or invalid book is reported in `problems` and left out of the catalog,
 *   so the UI never offers a book that cannot be played.
 */
function loadBooks(dataDir) {
  const catalogFile = path.join(dataDir, 'catalog.json');
  const rawCatalog = readJson(catalogFile);
  if (!Array.isArray(rawCatalog)) throw new Error(`${catalogFile} must contain a JSON array`);

  const catalog = [];
  const books = new Map();
  const problems = [];

  for (const entry of rawCatalog) {
    if (!entry || !ID_RE.test(entry.id || '') || !isNonEmptyString(entry.title)) {
      problems.push(`catalog entry ignored (invalid id/title): ${JSON.stringify(entry)}`);
      continue;
    }
    const file = path.join(dataDir, `${entry.id}.json`);
    if (!fs.existsSync(file)) {
      problems.push(`${entry.id}: ${file} not found`);
      continue;
    }
    let book;
    try {
      book = readJson(file);
    } catch (err) {
      problems.push(`${entry.id}: ${err.message}`);
      continue;
    }
    const valid =
      book && Array.isArray(book.words) && book.words.length > 0 &&
      book.words.every(w => w && isNonEmptyString(w.source) && isNonEmptyString(w.target));
    if (!valid) {
      problems.push(`${entry.id}: ${file} needs a non-empty "words" array of {source, target} strings`);
      continue;
    }
    books.set(entry.id, book);
    catalog.push(entry);
  }

  return { catalog, books, problems };
}

module.exports = { loadBooks };
