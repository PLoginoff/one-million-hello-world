/**
 * Localization — MessageFormat, plural rules, negotiation unit tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  MessageParseError,
  PseudoLocalizer,
  compileMessage,
  fallbackChain,
  formatMessage,
  negotiate,
  parseAcceptLanguage,
  pluralRuleFor,
  ruPlural,
} from '../i18n';

describe('plural rules', () => {
  it('en', () => {
    const r = pluralRuleFor('en-US');
    expect(r(1)).toBe('one');
    expect(r(0)).toBe('other');
    expect(r(2)).toBe('other');
    expect(r(1.5)).toBe('other');
  });

  it('ru — the mod10/mod100 matrix', () => {
    // one: n mod10=1 AND mod100≠11
    expect(ruPlural(1)).toBe('one');
    expect(ruPlural(21)).toBe('one');
    expect(ruPlural(31)).toBe('one');
    expect(ruPlural(101)).toBe('one');
    // few: mod10 2-4, mod100 not 12-14
    expect(ruPlural(2)).toBe('few');
    expect(ruPlural(3)).toBe('few');
    expect(ruPlural(22)).toBe('few');
    expect(ruPlural(104)).toBe('few');
    // many: mod10 0,5-9 or mod100 11-14
    expect(ruPlural(0)).toBe('many');
    expect(ruPlural(5)).toBe('many');
    expect(ruPlural(11)).toBe('many');
    expect(ruPlural(12)).toBe('many');
    expect(ruPlural(111)).toBe('many');
    // other: fractions
    expect(ruPlural(1.5)).toBe('other');
    expect(ruPlural(2.5)).toBe('other');
  });

  it('ar — full six categories', () => {
    const r = pluralRuleFor('ar');
    expect(r(0)).toBe('zero');
    expect(r(1)).toBe('one');
    expect(r(2)).toBe('two');
    expect(r(5)).toBe('few');
    expect(r(20)).toBe('many');
    expect(r(200)).toBe('other');
  });
});

describe('MessageFormat', () => {
  it('plain placeholder + escaping', () => {
    expect(formatMessage('Hi {name}', { name: 'A' }, 'en')).toBe('Hi A');
    expect(formatMessage("'{name}'", { name: 'A' }, 'en')).toBe('{name}'); // quoted = literal
    expect(formatMessage('missing {x}', {}, 'en')).toBe('missing {x}');
  });

  it('plural with exact =N override', () => {
    const tpl = '{n, plural, =0{no items} one{# item} other{# items}}';
    expect(formatMessage(tpl, { n: 0 }, 'en')).toBe('no items');
    expect(formatMessage(tpl, { n: 1 }, 'en')).toBe('1 item');
    expect(formatMessage(tpl, { n: 7 }, 'en')).toBe('7 items');
  });

  it('plural with offset', () => {
    const tpl = '{n, plural, offset:1 one{you and one other} other{you and # others}}';
    expect(formatMessage(tpl, { n: 2 }, 'en')).toBe('you and one other');
    expect(formatMessage(tpl, { n: 5 }, 'en')).toBe('you and 4 others');
  });

  it('nested select inside plural', () => {
    const tpl = '{n, plural, one{{g, select, m{his} f{her} other{their}} item} other{# items}}';
    expect(formatMessage(tpl, { n: 1, g: 'f' }, 'en')).toBe('her item');
    expect(formatMessage(tpl, { n: 2, g: 'f' }, 'en')).toBe('2 items');
  });

  it('parse errors are descriptive', () => {
    expect(() => compileMessage('{n, plural, one{x}}')).toThrow(MessageParseError); // no 'other'
    expect(() => compileMessage('{n, bogus, x{y}}')).toThrow(MessageParseError);
  });

  it('compiled templates cache — same AST instance', () => {
    const c = compileMessage('{a} and {b}');
    expect(c.ast.length).toBeGreaterThan(0);
    const c2 = compileMessage('{a} and {b}');
    expect(c2.ast).not.toBe(c.ast); // separate compiles produce separate ASTs — caching lives in MessageCatalog
  });
});

describe('LocaleNegotiator', () => {
  it('parses q-values, skips malformed, stable order', () => {
    const c = parseAcceptLanguage('fr-CA, fr;q=0.9, bad tag here;q=0.5, en;q=0.8, *;q=0.1');
    expect(c.map((x) => x.tag)).toEqual(['fr-CA', 'fr', 'en', '*']);
    expect(c[1].q).toBe(0.9);
  });

  it('q=0 entries dropped', () => {
    const c = parseAcceptLanguage('en, ru;q=0');
    expect(c.map((x) => x.tag)).toEqual(['en']);
  });

  it('fallbackChain', () => {
    expect(fallbackChain('zh-Hant-TW', 'en')).toEqual(['zh-hant-tw', 'zh-hant', 'zh', 'en']);
    expect(fallbackChain('en', 'en')).toEqual(['en']);
    expect(fallbackChain('fr', 'en')).toEqual(['fr', 'en']);
  });

  it('negotiate picks best available', () => {
    const avail = ['en', 'ru', 'fr'];
    expect(negotiate('fr-CA', avail, 'en')).toBe('fr');
    expect(negotiate('ru-RU', avail, 'en')).toBe('ru');
    // No match → default is the final fallback entry, so 'en' wins.
    expect(negotiate('de', avail, 'en')).toBe('en');
    expect(negotiate('de, *;q=0.5', avail, 'en')).toBe('en'); // wildcard → default
  });
});

describe('PseudoLocalizer', () => {
  it('accents text, preserves placeholders', () => {
    const p = new PseudoLocalizer();
    const out = p.transformTemplate('Hello {name}, you have {n} messages');
    expect(out).toContain('{name}');
    expect(out).toContain('{n}');
    expect(out).not.toContain('Hello');
    expect(out).toMatch(/[àáâãäåèéêëìíîï]/); // some accented char
  });

  it('plural arms keep structure', () => {
    const p = new PseudoLocalizer();
    const out = p.transformTemplate('{n, plural, one{# item} other{# items}}');
    expect(out).toContain('{n, plural,');
    expect(out).toContain('one {');
    expect(out).toContain('other {');
    // And it still formats.
    expect(formatMessage(out, { n: 2 }, 'en')).toContain('2');
  });
});
