const DEFAULT_LOCALE = 'zh-Hant';
let currentLocale = DEFAULT_LOCALE;

function resolveLocale(requestedLocale) {
  const locales = globalThis.RT_LOCALES || {};
  if (locales[requestedLocale]) return requestedLocale;
  const language = String(requestedLocale || '').split('-')[0].toLowerCase();
  return Object.keys(locales).find(locale => locale.split('-')[0].toLowerCase() === language)
    || DEFAULT_LOCALE;
}

function interpolateTranslation(template, params) {
  return String(template).replace(/\{([\w]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

function t(key, params = {}) {
  const locales = globalThis.RT_LOCALES || {};
  const activeMessages = locales[currentLocale] || {};
  const fallbackMessages = locales[DEFAULT_LOCALE] || {};
  const message = activeMessages[key] ?? fallbackMessages[key];
  return interpolateTranslation(message ?? key, params);
}

function formatLocaleNumber(value, options = {}) {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}

function translateElement(element) {
  const textKey = element.dataset.i18n;
  if (textKey) element.textContent = t(textKey);
  ['ariaLabel', 'alt', 'placeholder'].forEach(attribute => {
    const key = element.dataset[`i18n${attribute[0].toUpperCase()}${attribute.slice(1)}`];
    if (!key) return;
    const htmlAttribute = attribute.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    element.setAttribute(htmlAttribute, t(key));
  });
}

function applyTranslations(root = document) {
  const selector = '[data-i18n], [data-i18n-aria-label], [data-i18n-alt], [data-i18n-placeholder]';
  if (root.matches && root.matches(selector)) translateElement(root);
  root.querySelectorAll(selector).forEach(translateElement);
  document.title = t('meta.title');
  document.documentElement.lang = currentLocale;
}

function setLocale(locale) {
  currentLocale = resolveLocale(locale);
  document.dispatchEvent(new CustomEvent('localechange', { detail: { locale: currentLocale } }));
  applyTranslations();
  return currentLocale;
}

function initI18n(locale = document.documentElement.lang || DEFAULT_LOCALE) {
  currentLocale = resolveLocale(locale);
  applyTranslations();
}
