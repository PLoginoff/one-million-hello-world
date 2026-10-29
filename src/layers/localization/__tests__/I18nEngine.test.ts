/**
 * Localization — I18nEngine end-to-end tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { I18nEngine } from '../i18n';

const EN = {
  greeting: 'Hello {name}!',
  'cart.items': '{n, plural, one{# item} other{# items}}',
  errors: { auth: { invalid: 'Invalid credentials' } },
  'msg.select': '{g, select, male{He} female{She} other{They}} said hi',
  'msg.nested': 'Click {link, select, x{here} other{there}} to see {n, plural, one{# result} other{# results}}',
  'msg.formatted': 'Total: {v, number, 0.00}',
};

const RU = {
  'cart.items': '{n, plural, one{# товар} few{# товара} many{# товаров} other{# товара}}',
  errors: { auth: { invalid: 'Неверные учётные данные' } },
};

const FR_CA = { greeting: 'Allo {name}!' };
const FR = { greeting: 'Bonjour {name}!' };

describe('I18nEngine > translation + fallback', () => {
  let engine: I18nEngine;

  beforeEach(() => {
    engine = new I18nEngine({ defaultLocale: 'en' });
    engine.registerCatalog('en', EN);
    engine.registerCatalog('ru', RU);
    engine.registerCatalog('fr-ca', FR_CA);
    engine.registerCatalog('fr', FR);
  });

  it('translates with placeholders and nested keys', async () => {
    expect(await engine.t('greeting', { name: 'Ada' }, 'en')).toBe('Hello Ada!');
    expect(await engine.t('errors.auth.invalid', {}, 'en')).toBe('Invalid credentials');
    expect(await engine.t('errors.auth.invalid', {}, 'ru')).toBe('Неверные учётные данные');
  });

  it('fallback chain fr-CA → fr → en per key', async () => {
    // fr-ca has 'greeting' — served directly.
    expect(await engine.t('greeting', { name: 'X' }, 'fr-ca')).toBe('Allo X!');
    // fr-ca lacks 'cart.items' — falls to fr (misses) then en (hits).
    expect(await engine.t('cart.items', { n: 2 }, 'fr-ca')).toBe('2 items');
    // fr falls to en too.
    expect(await engine.t('cart.items', { n: 1 }, 'fr')).toBe('1 item');
  });

  it('missing key renders marker and is reported', async () => {
    const out = await engine.t('nonexistent.key', {}, 'en');
    expect(out).toBe('⟦nonexistent.key⟧');
    expect(await engine.t('nonexistent.key', {}, 'en'));
    const report = engine.reporter.report();
    expect(report.length).toBe(1);
    expect(report[0].key).toBe('nonexistent.key');
    expect(report[0].count).toBe(2);
  });

  it('lazy loading: catalog loads on first use, shared promise', async () => {
    const lazy = new I18nEngine({ defaultLocale: 'en' });
    let loads = 0;
    lazy.registerCatalog('de', async () => {
      loads++;
      return { greeting: 'Hallo {name}!' };
    });
    // Not loaded until first use.
    expect(lazy.locales()).toContain('de');
    const [a, b] = await Promise.all([
      lazy.t('greeting', { name: 'A' }, 'de'),
      lazy.t('greeting', { name: 'B' }, 'de'),
    ]);
    expect(a).toBe('Hallo A!');
    expect(b).toBe('Hallo B!');
    expect(loads).toBe(1); // shared pending promise
  });

  it('sync tSync works after preload', async () => {
    await engine.preload('ru');
    await engine.preload('en'); // fallback target must be loaded for tSync
    expect(engine.tSync('cart.items', { n: 5 }, 'ru')).toBe('5 товаров');
    expect(engine.tSync('greeting', { name: 'S' }, 'ru')).toBe('Hello S!'); // falls back to en
  });
});

describe('I18nEngine > plural + select', () => {
  let engine: I18nEngine;
  beforeEach(() => {
    engine = new I18nEngine({ defaultLocale: 'en' });
    engine.registerCatalog('en', EN);
    engine.registerCatalog('ru', RU);
  });

  it('english plurals', async () => {
    expect(await engine.t('cart.items', { n: 1 })).toBe('1 item');
    expect(await engine.t('cart.items', { n: 5 })).toBe('5 items');
    expect(await engine.t('cart.items', { n: 0 })).toBe('0 items');
  });

  it('russian plurals: one/few/many', async () => {
    expect(await engine.t('cart.items', { n: 1 }, 'ru')).toBe('1 товар');
    expect(await engine.t('cart.items', { n: 3 }, 'ru')).toBe('3 товара');
    expect(await engine.t('cart.items', { n: 5 }, 'ru')).toBe('5 товаров');
    expect(await engine.t('cart.items', { n: 21 }, 'ru')).toBe('21 товар'); // mod10=1, mod100≠11
    expect(await engine.t('cart.items', { n: 11 }, 'ru')).toBe('11 товаров'); // mod100=11 → many
    expect(await engine.t('cart.items', { n: 1.5 }, 'ru')).toBe('1.5 товара'); // fraction → other
  });

  it('select', async () => {
    expect(await engine.t('msg.select', { g: 'male' })).toBe('He said hi');
    expect(await engine.t('msg.select', { g: 'female' })).toBe('She said hi');
    expect(await engine.t('msg.select', { g: 'nb' })).toBe('They said hi');
    expect(await engine.t('msg.select', {})).toBe('They said hi'); // missing arg → other
  });

  it('nested select + plural in one message', async () => {
    const out = await engine.t('msg.nested', { link: 'x', n: 42 });
    expect(out).toBe('Click here to see 42 results');
  });

  it('number formatting stub', async () => {
    expect(await engine.t('msg.formatted', { v: 3.14159 })).toBe('Total: 3.14');
  });
});

describe('I18nEngine > negotiation + pseudo + coverage', () => {
  let engine: I18nEngine;
  beforeEach(() => {
    engine = new I18nEngine({ defaultLocale: 'en' });
    engine.registerCatalog('en', EN);
    engine.registerCatalog('ru', RU);
    engine.registerCatalog('fr', FR);
  });

  it('negotiates Accept-Language', () => {
    expect(engine.negotiateLocale('ru-RU, ru;q=0.9, en;q=0.5')).toBe('ru');
    expect(engine.negotiateLocale('fr-CA')).toBe('fr'); // fr-ca falls to fr
    expect(engine.negotiateLocale('de, en;q=0.9')).toBe('en');
    // 'zh' has no catalog — negotiate falls back to the default as last resort.
    expect(engine.negotiateLocale('zh')).toBe('en');
  });

  it('pseudo-localizes through the catalog', async () => {
    const out = await engine.pseudo('greeting', { name: 'X' }, 'en');
    expect(out).toContain('X'); // placeholder kept
    expect(out).not.toContain('Hello'); // text was transformed
    expect(out.startsWith('[') || out.includes('~')).toBe(true);
  });

  it('coverage report lists untranslated keys', async () => {
    await engine.preload('ru');
    await engine.preload('en');
    const enCat = engine.registry.getSync('en');
    const ruCat = engine.registry.getSync('ru');
    const report = engine.reporter.coverage(enCat!.keys(), [ruCat!]);
    expect(report['ru'].missing).toContain('greeting');
    expect(report['ru'].percent).toBeLessThan(100);
  });
});
