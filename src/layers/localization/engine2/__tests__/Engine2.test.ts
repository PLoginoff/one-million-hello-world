/**
 * Tests for localization engine2: TranslationMemory, MT orchestrator,
 * FallbackResolver, CLDR PluralRules, QualityScorer.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  buildChain,
  FallbackResolver,
  formatPlural,
  MockTranslator,
  MTOrchestrator,
  PhrasebookTranslator,
  pluralCategory,
  placeholdersOf,
  QualityScorer,
  similarity,
  TranslationMemory,
} from '..';

describe('TranslationMemory', () => {
  let tm: TranslationMemory;

  beforeEach(() => {
    tm = new TranslationMemory();
    tm.add({ source: 'Delete the file', target: 'Supprimer le fichier', sourceLocale: 'en', targetLocale: 'fr' });
    tm.add({ source: 'Save changes', target: 'Enregistrer les modifications', sourceLocale: 'en', targetLocale: 'fr' });
  });

  it('returns exact matches at score 1', () => {
    const m = tm.lookup('Delete the file', 'en', 'fr');
    expect(m).not.toBeNull();
    expect(m!.exact).toBe(true);
    expect(m!.entry.target).toBe('Supprimer le fichier');
  });

  it('fuzzy-matches near-identical source strings', () => {
    // "Delete the files" vs "Delete the file"
    const m = tm.lookup('Delete the files', 'en', 'fr');
    expect(m).not.toBeNull();
    expect(m!.exact).toBe(false);
    expect(m!.score).toBeGreaterThan(0.6);
  });

  it('rejects dissimilar sources below threshold', () => {
    const m = tm.lookup('Completely unrelated text here', 'en', 'fr');
    expect(m).toBeNull();
  });

  it('respects context scoping', () => {
    tm.add({ source: 'Open', target: 'Ouvrir (btn)', sourceLocale: 'en', targetLocale: 'fr', context: 'button' });
    tm.add({ source: 'Open', target: 'Ouvert (adj)', sourceLocale: 'en', targetLocale: 'fr', context: 'adjective' });
    const m = tm.lookup('Open', 'en', 'fr', 0.7, 'button');
    expect(m!.entry.target).toContain('btn');
  });

  it('never crosses language pairs', () => {
    tm.add({ source: 'Hallo', target: 'Hello', sourceLocale: 'de', targetLocale: 'en' });
    expect(tm.lookup('Delete the file', 'en', 'de')).toBeNull();
    expect(tm.size('en', 'fr')).toBe(2);
    expect(tm.size()).toBe(3);
  });

  it('similarity() ranks bigram-overlap correctly', () => {
    expect(similarity('a b c', 'a b c')).toBe(1);
    expect(similarity('the cat sat', 'the cat slept')).toBeGreaterThan(0);
    expect(similarity('abc', 'xyz')).toBe(0);
  });
});

describe('MachineTranslator + MTOrchestrator', () => {
  it('mock translator preserves placeholders', async () => {
    const mt = new MockTranslator();
    const out = await mt.translate('Hello {name}, you have {count} msgs', 'en', 'fr');
    expect(out).toContain('{name}');
    expect(out).toContain('{count}');
    expect(out).toContain('⟦');
  });

  it('phrasebook translator uses registered phrases, mock otherwise', async () => {
    const mt = new PhrasebookTranslator({ 'Sign in': 'Se connecter' });
    expect(await mt.translate('Sign in', 'en', 'fr')).toBe('Se connecter');
    expect(await mt.translate('Other', 'en', 'fr')).toBe('[MT]Other');
  });

  it('orchestrator prefers exact TM hits over MT', async () => {
    const tm = new TranslationMemory();
    tm.add({ source: 'Hello', target: 'Bonjour', sourceLocale: 'en', targetLocale: 'fr' });
    const orch = new MTOrchestrator({ memory: tm, provider: new MockTranslator() });
    const res = await orch.translate('Hello', 'en', 'fr');
    expect(res.source).toBe('memory-exact');
    expect(res.text).toBe('Bonjour');
  });

  it('orchestrator falls back to MT on miss and reports fuzzy source', async () => {
    const tm = new TranslationMemory();
    tm.add({ source: 'Delete the file', target: 'Supprimer le fichier', sourceLocale: 'en', targetLocale: 'fr' });
    const orch = new MTOrchestrator({ memory: tm, provider: new MockTranslator() });
    const fuzzy = await orch.translate('Delete the files', 'en', 'fr');
    expect(fuzzy.source).toBe('memory-fuzzy+mt');
    const miss = await orch.translate('A brand new string', 'en', 'fr');
    expect(miss.source).toBe('mt');
  });
});

describe('FallbackResolver', () => {
  let resolver: FallbackResolver;

  beforeEach(() => {
    resolver = new FallbackResolver('en');
    resolver.register({ locale: 'en', messages: { hello: 'Hello', bye: 'Bye' } });
    resolver.register({ locale: 'fr', messages: { hello: 'Bonjour' } });
    resolver.register({ locale: 'fr-CA', messages: { bye: 'Au revoir' } });
  });

  it('builds multi-level chains for regional tags', () => {
    expect(buildChain('zh-Hant-TW', 'en').chain).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en']);
    expect(buildChain('fr-CA', 'en').chain).toEqual(['fr-CA', 'fr', 'en']);
    expect(buildChain('en', 'en').chain).toEqual(['en']);
  });

  it('walks region -> language -> default', () => {
    expect(resolver.get('hello', 'fr-CA')).toBe('Bonjour'); // fr
    expect(resolver.get('bye', 'fr-CA')).toBe('Au revoir'); // fr-CA
  });

  it('per-key override pins a key to a fixed locale', () => {
    resolver.overrideKey({ key: 'bye', locale: 'en' });
    const r = resolver.resolve('bye', 'fr-CA');
    expect(r!.value).toBe('Bye');
    expect(r!.resolvedFrom).toBe('en');
    resolver.clearOverride('bye');
    expect(resolver.get('bye', 'fr-CA')).toBe('Au revoir');
  });

  it('returns null when the whole chain misses', () => {
    expect(resolver.resolve('nope', 'fr-CA')).toBeNull();
  });
});

describe('PluralRules — CLDR edge cases', () => {
  it('Russian one/few/many with teens exception', () => {
    expect(pluralCategory(1, 'ru')).toBe('one');
    expect(pluralCategory(2, 'ru')).toBe('few');
    expect(pluralCategory(5, 'ru')).toBe('many');
    expect(pluralCategory(11, 'ru')).toBe('many'); // teens
    expect(pluralCategory(21, 'ru')).toBe('one'); // 21 -> mod10=1
    expect(pluralCategory(22, 'ru')).toBe('few');
    expect(pluralCategory(111, 'ru')).toBe('many');
    expect(pluralCategory(1.5, 'ru')).toBe('other'); // decimals
  });

  it('Arabic uses all six categories', () => {
    expect(pluralCategory(0, 'ar')).toBe('zero');
    expect(pluralCategory(1, 'ar')).toBe('one');
    expect(pluralCategory(2, 'ar')).toBe('two');
    expect(pluralCategory(3, 'ar')).toBe('few');
    expect(pluralCategory(10, 'ar')).toBe('few');
    expect(pluralCategory(11, 'ar')).toBe('many');
    expect(pluralCategory(99, 'ar')).toBe('many');
    expect(pluralCategory(100, 'ar')).toBe('other');
  });

  it('Polish mirrors Russian with its own boundary rules', () => {
    expect(pluralCategory(1, 'pl')).toBe('one');
    expect(pluralCategory(3, 'pl')).toBe('few');
    expect(pluralCategory(5, 'pl')).toBe('many');
    expect(pluralCategory(12, 'pl')).toBe('many');
    expect(pluralCategory(23, 'pl')).toBe('few');
  });

  it('French folds zero into singular', () => {
    expect(pluralCategory(0, 'fr')).toBe('one');
    expect(pluralCategory(1, 'fr')).toBe('one');
    expect(pluralCategory(2, 'fr')).toBe('other');
  });

  it('East-Asian languages have no plural categories', () => {
    for (const n of [0, 1, 2, 100]) {
      expect(pluralCategory(n, 'ja')).toBe('other');
      expect(pluralCategory(n, 'zh')).toBe('other');
    }
  });

  it('English default is one/other', () => {
    expect(pluralCategory(1, 'en')).toBe('one');
    expect(pluralCategory(0, 'en')).toBe('other');
    expect(pluralCategory(1.5, 'en')).toBe('other');
  });

  it('formatPlural selects the right form and interpolates', () => {
    const forms = { one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' };
    expect(formatPlural(forms, 1, 'ru')).toBe('1 файл');
    expect(formatPlural(forms, 3, 'ru')).toBe('3 файла');
    expect(formatPlural(forms, 7, 'ru')).toBe('7 файлов');
    // Missing category falls back to 'other'.
    const minimal = { other: '{count} items' };
    expect(formatPlural(minimal, 5, 'ru')).toBe('5 items');
  });
});

describe('QualityScorer', () => {
  const scorer = new QualityScorer();
  const reference = {
    locale: 'en',
    messages: {
      greet: 'Hello {name}',
      items: '{count} items',
      ok: 'OK',
    },
  };

  it('scores a perfect catalog at 1', () => {
    const fr = { locale: 'fr', messages: { greet: 'Bonjour {name}', items: '{count} articles', ok: "D'accord" } };
    const report = scorer.score(fr, reference);
    expect(report.score).toBe(1);
    expect(report.issues.length).toBe(0);
  });

  it('flags missing keys, placeholder mismatches, and untranslated text', () => {
    const fr = {
      locale: 'fr',
      messages: {
        greet: 'Bonjour', // missing {name}
        items: '{count} articles', // fine
        ok: 'OK', // identical to reference
        // 'items' would be missing if absent; keep it present so count is exact.
      },
    };
    const report = scorer.score(fr, reference);
    const kinds = report.issues.map((i) => i.kind).sort();
    expect(kinds).toEqual(['placeholder-mismatch', 'untranslated']);
    // 1 full-weight + 1 half-weight out of 3 keys -> 1 - 1.5/3
    expect(report.score).toBeCloseTo(0.5);
  });

  it('flags entirely missing keys at full weight', () => {
    const fr = { locale: 'fr', messages: { greet: 'Bonjour {name}' } };
    const report = scorer.score(fr, reference);
    expect(report.issues.filter((i) => i.kind === 'missing').length).toBe(2);
    expect(report.score).toBeCloseTo(1 / 3);
  });

  it('detects blank translations', () => {
    const fr = { locale: 'fr', messages: { greet: 'Bonjour {name}', items: '  ', ok: "D'accord" } };
    const report = scorer.score(fr, reference);
    expect(report.issues.some((i) => i.kind === 'empty')).toBe(true);
  });

  it('placeholdersOf extracts sorted names', () => {
    expect(placeholdersOf('{b} and {a}')).toEqual(['a', 'b']);
  });
});
