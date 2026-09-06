import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const translatedElement = {
  dataset: {
    i18n: 'header.bag',
    i18nAriaLabel: 'header.openBag',
  },
  textContent: '',
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
};
const documentMock = {
  title: '',
  documentElement: { lang: 'zh-Hant' },
  querySelectorAll() {
    return [translatedElement];
  },
  dispatchEvent() {},
};

global.document = documentMock;
global.location = { search: '' };
global.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init.detail;
  }
};

const { t, resolveLocale, setLocale, initI18n } = await import('../prototype/js/i18n.js');
const zhHant = (await import('../prototype/js/locales/zh-Hant.js')).default;
const en = (await import('../prototype/js/locales/en.js')).default;

assert.equal(t('header.bag'), '物品庫');
assert.equal(t('format.page', { current: 2, total: 5 }), '2／5');
assert.equal(t('missing.translation'), 'missing.translation');
assert.equal(resolveLocale('zh-TW'), 'zh-Hant');

setLocale('en');
assert.equal(t('header.bag'), 'Bag');
assert.equal(t('journal.next'), 'Next Page');

setLocale('zh-Hant');
assert.equal(documentMock.title, '共鳴之塔｜Resonance Tower');
assert.equal(documentMock.documentElement.lang, 'zh-Hant');
assert.equal(translatedElement.textContent, '物品庫');
assert.equal(translatedElement.attributes['aria-label'], '開啟物品庫');

const html = fs.readFileSync(path.join(root, 'prototype/game.html'), 'utf8');
const markerPattern = /data-i18n(?:-(?:aria-label|alt|placeholder))?="([^"]+)"/g;
const markerKeys = [...html.matchAll(markerPattern)].map(match => match[1]);
assert.deepEqual([...new Set(markerKeys.filter(key => !(key in zhHant)))], []);
assert.deepEqual(Object.keys(zhHant).filter(key => !(key in en)), []);

const sourceKeys = fs.readdirSync(path.join(root, 'prototype/js'))
  .filter(file => file.endsWith('.js'))
  .flatMap(file => {
    const source = fs.readFileSync(path.join(root, 'prototype/js', file), 'utf8');
    return [...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  });
assert.deepEqual([...new Set(sourceKeys.filter(key => !(key in zhHant)))], []);
assert.deepEqual([...new Set(sourceKeys.filter(key => !(key in en)))], []);

global.location.search = '?debug&lang=en';
initI18n();
assert.equal(documentMock.documentElement.lang, 'en');
assert.equal(documentMock.title, 'Resonance Tower');
assert.equal(translatedElement.textContent, 'Bag');

console.log(`i18n tests passed (${markerKeys.length} HTML markers and ${sourceKeys.length} source keys checked in zh-Hant/en)`);
