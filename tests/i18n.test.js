const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
const context = vm.createContext({
  Intl,
  URLSearchParams,
  location: { search: '' },
  document: documentMock,
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init.detail;
    }
  },
});
context.globalThis = context;

for (const file of ['prototype/js/locales/zh-Hant.js', 'prototype/js/locales/en.js', 'prototype/js/i18n.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

assert.equal(vm.runInContext("t('header.bag')", context), '背包');
assert.equal(vm.runInContext("t('format.page', { current: 2, total: 5 })", context), '2／5');
assert.equal(vm.runInContext("t('missing.translation')", context), 'missing.translation');
assert.equal(vm.runInContext("resolveLocale('zh-TW')", context), 'zh-Hant');

vm.runInContext("currentLocale = 'en'", context);
assert.equal(vm.runInContext("t('header.bag')", context), 'Bag');
assert.equal(vm.runInContext("t('journal.next')", context), 'Next Page');

vm.runInContext("currentLocale = 'zh-Hant'; applyTranslations()", context);
assert.equal(documentMock.title, '共鳴之塔｜Resonance Tower');
assert.equal(documentMock.documentElement.lang, 'zh-Hant');
assert.equal(translatedElement.textContent, '背包');
assert.equal(translatedElement.attributes['aria-label'], '開啟背包');

const html = fs.readFileSync(path.join(root, 'prototype/index.html'), 'utf8');
const markerPattern = /data-i18n(?:-(?:aria-label|alt|placeholder))?="([^"]+)"/g;
const markerKeys = [...html.matchAll(markerPattern)].map(match => match[1]);
const messages = context.RT_LOCALES['zh-Hant'];
const englishMessages = context.RT_LOCALES.en;
assert.deepEqual([...new Set(markerKeys.filter(key => !(key in messages)))], []);
assert.deepEqual(Object.keys(messages).filter(key => !(key in englishMessages)), []);

const sourceKeys = fs.readdirSync(path.join(root, 'prototype/js'))
  .filter(file => file.endsWith('.js'))
  .flatMap(file => {
    const source = fs.readFileSync(path.join(root, 'prototype/js', file), 'utf8');
    return [...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  });
assert.deepEqual([...new Set(sourceKeys.filter(key => !(key in messages)))], []);
assert.deepEqual([...new Set(sourceKeys.filter(key => !(key in englishMessages)))], []);

context.location.search = '?debug&lang=en';
vm.runInContext('initI18n()', context);
assert.equal(documentMock.documentElement.lang, 'en');
assert.equal(documentMock.title, 'Resonance Tower');
assert.equal(translatedElement.textContent, 'Bag');

console.log(`i18n tests passed (${markerKeys.length} HTML markers and ${sourceKeys.length} source keys checked in zh-Hant/en)`);
