/**
 * Localization — Localizer + TranslationMemory tests.
 * Configuration — ConfigLinter tests.
 */

import { describe, it, expect } from 'bun:test';
import { I18nEngine, Localizer, TranslationMemory } from '../i18n';
import { ConfigLinter, entropy } from '../../configuration/engine/ConfigLinter';
import { ConfigPrecedence } from '../../configuration/engine';

describe('Localizer', () => {
  it('binds locale and merges base args', async () => {
    const engine = new I18nEngine({ defaultLocale: 'en' });
    engine.registerCatalog('en', { greeting: 'Hello {name} from {place}!' });
    engine.registerCatalog('ru', { greeting: 'Привет {name} из {place}!' });
    await engine.preload('en');
    await engine.preload('ru');

    const l = new Localizer(engine, 'ru', { place: 'СПб' });
    expect(await l.t('greeting', { name: 'Аня' })).toBe('Привет Аня из СПб!');
    expect(l.locale).toBe('ru');

    const child = l.extend({ name: 'Борис' });
    expect(await child.t('greeting')).toBe('Привет Борис из СПб!');
  });
});

describe('TranslationMemory', () => {
  it('learns, suggests, detects drift', () => {
    const tm = new TranslationMemory();
    tm.learn('ru', 'Save changes', 'Сохранить изменения');
    tm.learn('ru', 'Save changes', 'Сохранить изменения');
    expect(tm.suggest('ru', 'Save changes')).toBe('Сохранить изменения');
    expect(tm.suggest('ru', 'unknown')).toBeUndefined();
    expect(tm.check('ru', 'Save changes', 'Сохранить изменения')).toBeUndefined();
    const drift = tm.check('ru', 'Save changes', 'Записать изменения');
    expect(drift).toBeDefined();
    expect(drift!.hits).toBe(2);
  });
});

describe('ConfigLinter', () => {
  it('flags deprecated keys and suspicious types', () => {
    const l = new ConfigLinter({
      deprecatedPaths: ['old.key'],
      schema: [{ path: 'server.port', type: 'number' }],
    });
    const f = l.lint('defaults', { 'old.key': 'x', 'server.port': 'notnum' });
    expect(f.some((x) => x.rule === 'deprecated-key')).toBe(true);
    expect(f.some((x) => x.rule === 'suspicious-type')).toBe(true);
  });

  it('flags high-entropy secrets in low tiers but not env', () => {
    const l = new ConfigLinter({
      secretPatterns: ['**.password'],
      layerTiers: { defaults: ConfigPrecedence.DEFAULTS, env: ConfigPrecedence.ENV },
    });
    const low = l.lint('defaults', { 'db.password': 'xK9#mP2$vL8qR' });
    expect(low.some((x) => x.rule === 'secret-in-plain')).toBe(true);
    const high = l.lint('env', { 'db.password': 'xK9#mP2$vL8qR' });
    expect(high.some((x) => x.rule === 'secret-in-plain')).toBe(false);
    // Low-entropy placeholders aren't flagged.
    const weak = l.lint('defaults', { 'db.password': 'changeme' });
    expect(weak.some((x) => x.rule === 'secret-in-plain')).toBe(false);
  });

  it('shadowed-key finds dead config in lower tiers', () => {
    const l = new ConfigLinter({ layerTiers: { defaults: 0, env: 2 } });
    const findings = l.lintShadowed({
      defaults: { 'a.b': 1, 'a.c': 2 },
      env: { 'a.b': 9 },
    });
    expect(findings.length).toBe(1);
    expect(findings[0].path).toBe('a.b');
    expect(findings[0].severity).toBe('info');
  });

  it('unresolved-interpolation notes missing refs as info', () => {
    const l = new ConfigLinter({});
    const f = l.lint('x', { url: 'http://${missing}/x', ok: 'fine' });
    expect(f.some((x) => x.rule === 'unresolved-interpolation' && x.severity === 'info')).toBe(true);
  });

  it('entropy is higher for random strings than words', () => {
    expect(entropy('xK9#mP2$vL8qR3zN')).toBeGreaterThan(entropy('password123'));
  });
});
