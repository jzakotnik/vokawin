const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadBooks } = require('../server/catalog');

test('catalog.json and every referenced book are valid', () => {
  const { catalog, books, problems } = loadBooks(path.join(__dirname, '..', 'data'));
  assert.deepStrictEqual(problems, []);
  assert.ok(books.size > 0);
  assert.strictEqual(catalog.length, books.size);
});
