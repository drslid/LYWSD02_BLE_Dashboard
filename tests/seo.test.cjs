'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { BASE_URL, LOCALES, SEO, MESSAGES } = require('../i18n.js');
const { buildFiles, renderPage } = require('../scripts/build-locales.cjs');

const ROOT = path.resolve(__dirname, '..');
const codes = ['en', 'fr', 'es', 'it', 'de', 'ar', 'zh', 'pt', 'hi'];
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"
})[entity]);
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)]
  .map(([, name, value]) => [name, decode(value)]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => attributes(tag));
const canonical = (code) => BASE_URL + (code === 'en' ? '' : `${code}/`);
const pagePath = (code) => code === 'en' ? 'index.html' : `${code}/index.html`;

test('all generated pages and the sitemap match their editable sources', () => {
  assert.deepEqual(Object.keys(LOCALES), codes);
  for (const [filename, expected] of buildFiles()) assert.equal(read(filename), expected, `${filename} needs regeneration`);
});

for (const code of codes) {
  test(`${code}: source HTML exposes complete localized content and search metadata without JavaScript`, () => {
    const html = read(pagePath(code));
    const locale = LOCALES[code];
    const document = tags(html, 'html')[0];
    assert.equal(document.lang, locale.tag);
    assert.equal(document.dir, locale.dir);
    assert.equal(document['data-locale'], code);
    assert.equal(decode(html.match(/<title>([^<]*)<\/title>/)[1]), SEO[code].title);

    const meta = tags(html, 'meta');
    const getMeta = (name) => meta.find((tag) => tag.name === name || tag.property === name)?.content;
    assert.equal(getMeta('description'), SEO[code].description);
    assert.equal(getMeta('og:title'), SEO[code].ogTitle);
    assert.equal(getMeta('og:description'), SEO[code].ogDescription);
    assert.equal(getMeta('og:locale'), locale.og);
    assert.equal(getMeta('og:url'), canonical(code));
    assert.equal(getMeta('twitter:title'), SEO[code].ogTitle);
    assert.equal(getMeta('twitter:description'), SEO[code].ogDescription);
    assert.ok(getMeta('og:image:alt'));
    assert.equal(getMeta('og:image:alt'), getMeta('twitter:image:alt'));
    assert.doesNotMatch(getMeta('robots'), /noindex|nofollow/);
    assert.deepEqual(meta.filter((tag) => tag.property === 'og:locale:alternate').map((tag) => tag.content).sort(),
      codes.filter((other) => other !== code).map((other) => LOCALES[other].og).sort());

    const links = tags(html, 'link');
    assert.deepEqual(links.filter((tag) => tag.rel === 'canonical').map((tag) => tag.href), [canonical(code)]);
    assert.deepEqual(links.filter((tag) => tag.rel === 'alternate').map((tag) => [tag.hreflang, tag.href]),
      [...codes.map((other) => [LOCALES[other].hreflang, canonical(other)]), ['x-default', BASE_URL]]);

    for (const [, key, content] of html.matchAll(/\bdata-i18n="([^"]+)"[^>]*>([^<]*)<\//g)) {
      const expected = (MESSAGES[code][key] ?? MESSAGES.en[key]).replace('{count}', '0');
      assert.equal(decode(content), expected, `${code}.${key}`);
    }
    for (const key of ['hero.title', 'hero.lead', 'mobile.title', 'settings.title', 'history.title']) {
      assert.ok(decode(html).includes(MESSAGES[code][key] ?? MESSAGES.en[key]), `${key} must exist without JS`);
    }
    assert.doesNotMatch(html, /\{count\}|<!-- LANGUAGE_LINKS -->/);
    for (const [, options] of html.matchAll(/<select\b[^>]*data-language-select[^>]*>([\s\S]*?)<\/select>/g)) {
      const selected = [...options.matchAll(/<option\b([^>]*\sselected[^>]*)>/g)].map(([, tag]) => attributes(tag).value);
      assert.deepEqual(selected, [code]);
    }

    const graph = JSON.parse(html.match(/<script\b[^>]*id="structuredData"[^>]*>([\s\S]*?)<\/script>/)[1])['@graph'];
    for (const type of ['WebSite', 'WebApplication']) {
      const item = graph.find((entry) => entry['@type'] === type);
      assert.equal(item.url, canonical(code));
      assert.equal(item.inLanguage, locale.tag);
      assert.equal(item.description, SEO[code].description);
    }
    const app = graph.find((entry) => entry['@type'] === 'WebApplication');
    assert.ok(app.featureList.includes(MESSAGES[code]['history.export'] ?? MESSAGES.en['history.export']));
  });

  test(`${code}: crawlable language navigation and local resources resolve under GitHub Pages and localhost`, () => {
    const html = read(pagePath(code));
    const pageUrl = new URL(canonical(code));
    const languageLinks = tags(html, 'a').filter((tag) => tag.hreflang);
    const languageNavigation = tags(html, 'nav').filter((tag) => tag.class === 'language-links');
    assert.equal(languageNavigation.length, 2, 'Both mobile and desktop must expose the language links');
    for (const nav of languageNavigation) assert.equal(nav['aria-label'], MESSAGES[code]['header.language']);
    for (const other of codes) {
      const link = languageLinks.find((tag) => tag.hreflang === LOCALES[other].hreflang);
      assert.ok(link, `Missing ${other} navigation link`);
      assert.equal(new URL(link.href, pageUrl).href, canonical(other));
      assert.equal(new URL(link.href, `http://localhost:4173/${code === 'en' ? '' : `${code}/`}`).pathname,
        other === 'en' ? '/' : `/${other}/`);
    }
    for (const [, attribute, raw] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
      const value = decode(raw);
      if (!value || value.startsWith('#') || /^[a-z]+:/i.test(value) || value.startsWith('//')) continue;
      const resolved = new URL(value, pageUrl);
      assert.ok(resolved.href.startsWith(BASE_URL), `${attribute} escapes the project: ${value}`);
      const relative = decodeURIComponent(resolved.pathname.slice(new URL(BASE_URL).pathname.length));
      const filename = path.join(ROOT, relative.endsWith('/') || !relative ? `${relative}index.html` : relative);
      assert.ok(fs.existsSync(filename), `Missing local resource: ${value} (${filename})`);
    }
    assert.equal(new URL(tags(html, 'link').find((tag) => tag.rel === 'manifest').href, pageUrl).href,
      BASE_URL + 'site.webmanifest');
  });
}

test('the sitemap lists canonical pages with reciprocal language references and existing images', () => {
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(sitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.doesNotMatch(sitemap, /<priority>|<changefreq>|<image:title>|<image:caption>|\?lang=/);
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, entry]) => entry);
  assert.equal(entries.length, codes.length);
  assert.deepEqual(entries.map((entry) => entry.match(/<loc>([^<]+)<\/loc>/)[1]), codes.map(canonical));
  for (const entry of entries) {
    assert.match(entry, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.deepEqual(tags(entry, 'xhtml:link').map((tag) => [tag.hreflang, tag.href]),
      [...codes.map((code) => [LOCALES[code].hreflang, canonical(code)]), ['x-default', BASE_URL]]);
    const images = [...entry.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(([, image]) => image);
    assert.equal(images.length, 3);
    for (const image of images) assert.ok(fs.existsSync(path.join(ROOT, image.slice(BASE_URL.length))), image);
  }
});

test('HTML generation escapes translation text and rejects nested markup in translated elements', () => {
  const template = read('templates/index.html');
  const original = MESSAGES.en['hero.title'];
  try {
    MESSAGES.en['hero.title'] = 'Sensor <script>alert("x")</script> & "quotes"';
    const html = renderPage(template, 'en');
    assert.ok(html.includes('Sensor &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;'));
    assert.ok(!html.includes('<script>alert("x")</script>'));
  } finally {
    MESSAGES.en['hero.title'] = original;
  }
  assert.throws(() => renderPage(template.replace('data-i18n="hero.title">', 'data-i18n="hero.title"><b>nested</b>'), 'en'),
    /only text/);
});

test('each page loads only the font families of its own script', () => {
  const scripts = { ar: 'Noto+Sans+Arabic', zh: 'Noto+Sans+SC', hi: 'Noto+Sans+Devanagari' };
  for (const code of codes) {
    const fonts = tags(read(pagePath(code)), 'link').find((tag) => tag.href?.startsWith('https://fonts.googleapis.com/'));
    const families = [...fonts.href.matchAll(/family=([^:&]+)/g)].map(([, family]) => family);
    assert.deepEqual(families, ['JetBrains+Mono', 'Manrope', ...(scripts[code] ? [scripts[code]] : [])], code);
  }
});

test('every page offers the Home Assistant integration from desktop and phone', () => {
  const { domain } = JSON.parse(read('custom_components/lywsd02_sync/manifest.json'));
  const hacs = 'https://my.home-assistant.io/redirect/hacs_repository/?owner=drslid&repository=LYWSD02_BLE_Dashboard&category=integration';
  for (const code of codes) {
    const html = read(pagePath(code));
    const links = tags(html, 'a').map((tag) => tag.href);
    assert.equal(links.filter((href) => href === hacs).length, 2, `${code}: desktop and phone HACS buttons`);
    assert.ok(links.includes(`https://my.home-assistant.io/redirect/config_flow_start/?domain=${domain}`), code);
    assert.ok(links.includes('#home-assistant') && /\sid="home-assistant"/.test(html), `${code}: header link and section`);
  }
});
