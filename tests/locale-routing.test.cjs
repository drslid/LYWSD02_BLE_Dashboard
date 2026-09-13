'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
const STORAGE_KEY = 'lywsd02-language-v1';
const PUBLISHED_ROOT = 'https://drslid.github.io/LYWSD02_BLE_Dashboard/';
const deployments = [
  'http://127.0.0.1:4173/',
  'http://127.0.0.1:4173/LYWSD02_BLE_Dashboard/',
  PUBLISHED_ROOT
];

function setup({ root, page = '', pageLocale, query = '', hash = '', storedLocale, storageBlocked = false }) {
  const url = new URL(page + query + hash, root);
  const navigation = { assigned: [], replaced: [] };
  const storage = new Map(storedLocale ? [[STORAGE_KEY, storedLocale]] : []);
  const attributes = new Map();
  const selectors = [{ value: '' }, { value: '' }];
  const document = {
    currentScript: { src: new URL('i18n.js', root).href },
    documentElement: { dataset: { locale: pageLocale } },
    querySelector(selector) {
      return {
        setAttribute(name, value) { attributes.set(`${selector}:${name}`, value); }
      };
    },
    querySelectorAll(selector) { return selector === '[data-language-select]' ? selectors : []; },
    getElementById() { return null; }
  };
  const context = {
    URL,
    URLSearchParams,
    document,
    location: {
      href: url.href,
      search: url.search,
      hash: url.hash,
      assign(target) { navigation.assigned.push(String(target)); },
      replace(target) { navigation.replaced.push(String(target)); }
    },
    localStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error('Storage unavailable');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage unavailable');
        storage.set(key, value);
      }
    },
    window: {}
  };
  vm.runInNewContext(source, context, { filename: 'i18n.js' });
  return { i18n: context.window.LYWSD02_I18N, document, navigation, storage, attributes, selectors };
}

for (const root of deployments) {
  test(`${root}: a page keeps its language despite a different saved preference`, () => {
    for (const [pageLocale, page, storedLocale, direction] of [
      ['en', '', 'fr', 'ltr'],
      ['fr', 'fr/', 'ar', 'ltr'],
      ['ar', 'ar/', 'en', 'rtl']
    ]) {
      const app = setup({ root, page, pageLocale, storedLocale, query: '?source=bookmark', hash: '#history' });
      assert.equal(app.i18n.locale(), pageLocale);
      assert.equal(app.i18n.localeTag(), pageLocale);
      assert.equal(app.document.documentElement.lang, pageLocale);
      assert.equal(app.document.documentElement.dir, direction);
      assert.deepEqual(app.selectors.map((select) => select.value), [pageLocale, pageLocale]);
      assert.deepEqual(app.navigation, { assigned: [], replaced: [] });
      assert.equal(app.i18n.publishedUrl(), PUBLISHED_ROOT + page);
      assert.equal(app.attributes.get('link[rel="canonical"]:href'), PUBLISHED_ROOT + page);
      assert.equal(app.attributes.get('meta[property="og:url"]:content'), PUBLISHED_ROOT + page);
    }
  });

  test(`${root}: old lang links replace the URL and preserve other parameters and fragments`, () => {
    for (const [page, pageLocale, lang, destination] of [
      ['', 'en', 'fr', 'fr/'],
      ['index.html', 'en', 'ar', 'ar/'],
      ['fr/', 'fr', 'en', ''],
      ['fr/index.html', 'fr', 'ar', 'ar/'],
      ['ar/', 'ar', 'fr', 'fr/'],
      ['ar/', 'ar', 'ar', 'ar/']
    ]) {
      const app = setup({
        root, page, pageLocale,
        query: `?source=bookmark&lang=${lang}&keep=1`,
        hash: '#history'
      });
      assert.deepEqual(app.navigation.replaced, [root + destination + '?source=bookmark&keep=1#history']);
      assert.deepEqual(app.navigation.assigned, []);
    }
  });

  test(`${root}: selecting a language uses its directory and remembers the selection`, () => {
    for (const [page, pageLocale, target, destination] of [
      ['', 'en', 'fr', 'fr/'],
      ['fr/', 'fr', 'ar', 'ar/'],
      ['ar/index.html', 'ar', 'en', '']
    ]) {
      const app = setup({ root, page, pageLocale, query: '?source=bookmark&keep=1', hash: '#settings' });
      app.i18n.setLocale(target);
      assert.deepEqual(app.navigation.assigned, [root + destination + '?source=bookmark&keep=1#settings']);
      assert.deepEqual(app.navigation.replaced, []);
      assert.equal(app.storage.get(STORAGE_KEY), target);
    }
  });
}

test('unknown language values, including inherited object keys, never trigger navigation', () => {
  for (const invalid of ['xx', 'toString', '__proto__', 'constructor', '']) {
    const app = setup({ root: deployments[1], page: 'fr/', pageLocale: 'fr', query: `?lang=${invalid}` });
    assert.equal(app.i18n.locale(), 'fr');
    assert.equal(app.i18n.publishedUrl(), PUBLISHED_ROOT + 'fr/');
    app.i18n.setLocale(invalid);
    assert.deepEqual(app.navigation, { assigned: [], replaced: [] });
    assert.equal(app.storage.has(STORAGE_KEY), false);
  }
});

test('a missing or invalid page locale safely falls back to English', () => {
  for (const pageLocale of [undefined, null, '', 'xx', 'toString', '__proto__']) {
    const app = setup({ root: deployments[0], pageLocale, storedLocale: 'ar' });
    assert.equal(app.i18n.locale(), 'en');
    assert.equal(app.document.documentElement.lang, 'en');
    assert.equal(app.document.documentElement.dir, 'ltr');
    assert.equal(app.i18n.publishedUrl(), PUBLISHED_ROOT);
    assert.deepEqual(app.navigation, { assigned: [], replaced: [] });
  }
});

test('language navigation removes obsolete lang parameters even after an invalid query', () => {
  const app = setup({
    root: deployments[1], page: 'ar/', pageLocale: 'ar',
    query: '?lang=unknown&source=bookmark&lang=fr', hash: '#settings'
  });
  app.i18n.setLocale('fr');
  assert.deepEqual(app.navigation.replaced, []);
  assert.deepEqual(app.navigation.assigned, [deployments[1] + 'fr/?source=bookmark#settings']);
});

test('disabled local storage does not block page rendering or a language change', () => {
  const app = setup({ root: deployments[0], page: 'ar/', pageLocale: 'ar', storageBlocked: true });
  assert.equal(app.i18n.locale(), 'ar');
  assert.equal(app.document.documentElement.dir, 'rtl');
  app.i18n.setLocale('fr');
  assert.deepEqual(app.navigation.assigned, [deployments[0] + 'fr/']);
  assert.equal(app.storage.size, 0);
});
