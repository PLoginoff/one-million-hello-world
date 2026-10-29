/**
 * Notification delivery engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TemplateEngine, escapeHtml } from '../delivery/TemplateEngine';
import { PreferenceStore, inQuietHours, quietEnd } from '../delivery/PreferenceStore';
import { DedupStore, dedupHash, fnv1a } from '../delivery/DedupStore';
import { DigestBatcher } from '../delivery/DigestBatcher';
import { DeliveryTracker } from '../delivery/DeliveryTracker';
import { DeliveryEngine } from '../delivery/DeliveryEngine';
import { EmailAdapter, SmsAdapter, WebhookAdapter } from '../delivery/ChannelAdapters';
import {
  Channel,
  Clock,
  DeliveryError,
  NotificationRequest,
  QuietHours,
} from '../delivery/NotificationTypes';

function fakeClock(start = Date.UTC(2024, 0, 1, 12)): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function n(userId: string, topic: string, vars: Record<string, unknown> = {}, extra: Partial<NotificationRequest> = {}): NotificationRequest {
  return { userId, topic, template: 't1', vars, ...extra };
}

// ------------------------------------------------------------- TemplateEngine

describe('TemplateEngine', () => {
  const engine = new TemplateEngine();
  beforeEach(() => {
    engine.register('welcome', { subject: 'Hi {{name}}', body: 'Hello {{name}}, {{count}} items' });
  });

  it('escapes HTML in variables', () => {
    expect(escapeHtml('<script>"x"&\'')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;');
    const r = engine.renderString('{{v}}', { v: '<b>bold</b>' });
    expect(r).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('triple-brace renders unescaped', () => {
    expect(engine.renderString('{{{v}}}', { v: '<b>x</b>' })).toBe('<b>x</b>');
  });

  it('interpolates registered templates', () => {
    const r = engine.render('welcome', { name: 'Ada', count: 3 });
    expect(r.subject).toBe('Hi Ada');
    expect(r.body).toBe('Hello Ada, 3 items');
  });

  it('missing vars render empty', () => {
    expect(engine.renderString('[{{x}}]', {})).toBe('[]');
  });

  it('#if blocks toggle on truthiness', () => {
    const t = 'A{{#if show}}YES{{/if}}Z';
    expect(engine.renderString(t, { show: true })).toBe('AYESZ');
    expect(engine.renderString(t, { show: false })).toBe('AZ');
    expect(engine.renderString(t, { show: [] })).toBe('AZ');
  });

  it('#each iterates with this/@index', () => {
    const t = '{{#each items}}{{@index}}:{{this}};{{/each}}';
    expect(engine.renderString(t, { items: ['a', 'b'] })).toBe('0:a;1:b;');
  });

  it('nested #each in objects', () => {
    const t = '{{#each users}}{{this.name}}({{@index}}){{/each}}';
    expect(engine.renderString(t, { users: [{ name: 'x' }, { name: 'y' }] })).toBe('x(0)y(1)');
  });

  it('throws on unknown template', () => {
    expect(() => engine.render('nope', {})).toThrow(DeliveryError);
  });
});

// ------------------------------------------------------------- PreferenceStore

describe('PreferenceStore', () => {
  const store = new PreferenceStore();
  const T = Date.UTC(2024, 5, 10, 3, 0); // 03:00 UTC

  it('defaults to allow', () => {
    expect(store.resolve('u', 'any', 'email', T).kind).toBe('allow');
  });

  it('exact deny beats wildcard allow', () => {
    store.setPreference({ userId: 'u', topic: '*', channel: 'email', rule: { effect: 'allow' } });
    store.setPreference({ userId: 'u', topic: 'ads', channel: 'email', rule: { effect: 'deny' } });
    expect(store.resolve('u', 'ads', 'email', T).kind).toBe('deny');
    expect(store.resolve('u', 'other', 'email', T).kind).toBe('allow');
  });

  it('digest rule resolves to digest', () => {
    store.setPreference({ userId: 'u2', topic: 'news', channel: 'email', rule: { effect: 'digest', every: 5 } });
    const r = store.resolve('u2', 'news', 'email', T);
    expect(r).toEqual({ kind: 'digest', every: 5 });
  });

  it('quiet hours defer non-urgent topics, pass urgent ones', () => {
    const q: QuietHours = { userId: 'u3', startHour: 22, endHour: 7 };
    store.setQuietHours(q);
    const lateNight = Date.UTC(2024, 5, 10, 23, 0); // 23:00 — inside 22→7
    const noon = Date.UTC(2024, 5, 10, 12, 0);
    expect(inQuietHours(lateNight, q)).toBe(true);
    expect(inQuietHours(noon, q)).toBe(false);

    const r = store.resolve('u3', 'promo', 'push', lateNight);
    expect(r.kind).toBe('defer');
    expect(quietEnd(lateNight, q)).toBe(Date.UTC(2024, 5, 11, 7, 0));
    // urgent topic bypasses quiet hours
    expect(store.resolve('u3', 'security', 'push', lateNight).kind).toBe('allow');
  });
});

// ------------------------------------------------------------- DedupStore

describe('DedupStore', () => {
  it('fnv1a is deterministic and well-distributed', () => {
    expect(fnv1a('a')).toBe(fnv1a('a'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
    expect(fnv1a('')).toBe('811c9dc5');
  });

  it('dedupes inside window, allows after expiry', () => {
    const clock = fakeClock(0);
    const d = new DedupStore(1000, clock);
    expect(d.check('h1')).toBe(false);
    expect(d.check('h1')).toBe(true);
    clock.advance(1001);
    expect(d.check('h1')).toBe(false);
  });

  it('dedupHash respects explicit dedupKey', () => {
    const a = n('u', 't', { x: 1 }, { dedupKey: 'K' });
    const b = n('u', 't', { x: 2 }, { dedupKey: 'K' });
    expect(dedupHash(a, 'email')).toBe(dedupHash(b, 'email'));
    const c = n('u', 't', { x: 1 });
    const d = n('u', 't', { x: 1 });
    expect(dedupHash(c, 'email')).toBe(dedupHash(d, 'email'));
  });
});

// ------------------------------------------------------------- DigestBatcher

describe('DigestBatcher', () => {
  it('emits when threshold reached, flushes remainder', () => {
    const clock = fakeClock(0);
    const b = new DigestBatcher(clock);
    expect(b.add(n('u', 'news'), 'email', 3)).toBeNull();
    expect(b.add(n('u', 'news'), 'email', 3)).toBeNull();
    const d = b.add(n('u', 'news'), 'email', 3);
    expect(d).not.toBeNull();
    expect(d!.items).toHaveLength(3);
    // new bucket; flush drains partials
    b.add(n('u', 'news'), 'email', 5);
    const flushed = b.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].items).toHaveLength(1);
  });

  it('buckets are per user/channel/topic', () => {
    const b = new DigestBatcher(fakeClock(0));
    b.add(n('u1', 'a'), 'email', 10);
    b.add(n('u2', 'a'), 'email', 10);
    b.add(n('u1', 'b'), 'email', 10);
    b.add(n('u1', 'a'), 'sms', 10);
    expect(b.flush()).toHaveLength(4);
  });
});

// ------------------------------------------------------------- DeliveryTracker

describe('DeliveryTracker', () => {
  it('reconciles provider callbacks and logs orphans', () => {
    const t = new DeliveryTracker(fakeClock(0));
    t.open('n1', 'u', 'email');
    t.markSent('n1', 'prov-1', null);
    const r = t.reconcile({ providerId: 'prov-1', status: 'delivered' });
    expect(r!.state).toBe('delivered');
    expect(t.reconcile({ providerId: 'unknown', status: 'delivered' })).toBeNull();
    expect(t.orphanCallbacks).toHaveLength(1);
  });
});

// ------------------------------------------------------------- DeliveryEngine

describe('DeliveryEngine', () => {
  let clock: ReturnType<typeof fakeClock>;
  let engine: DeliveryEngine;
  let email: EmailAdapter;
  let sms: SmsAdapter;

  beforeEach(() => {
    clock = fakeClock(Date.UTC(2024, 0, 1, 12));
    engine = new DeliveryEngine((userId, ch) => `${userId}@${ch}`, clock);
    email = new EmailAdapter();
    sms = new SmsAdapter();
    engine.registerAdapter(email);
    engine.registerAdapter(sms);
    engine.templates.register('t1', { subject: 'S {{v}}', body: 'B {{v}}' });
  });

  it('sends on explicit channel and records delivery', async () => {
    const id = await engine.notify(n('u', 'x', { v: 'hi' }, { channel: 'email' }));
    expect(id).not.toBeNull();
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toBe('S hi');
    expect(engine.tracker.get(id!)!.state).toBe('sent');
  });

  it('fans out to allowed channels when none specified', async () => {
    // deny sms + webhook+push have no adapter → email and sms attempted
    engine.preferences.setPreference({ userId: 'u', topic: '*', channel: 'sms', rule: { effect: 'deny' } });
    await engine.notify(n('u', 'x', { v: 'v' }));
    expect(email.sent).toHaveLength(1);
    expect(sms.sent).toHaveLength(0);
  });

  it('deduplicates identical content', async () => {
    const msg = n('u', 'x', { v: 'same' }, { channel: 'email' });
    await engine.notify(msg);
    await engine.notify(msg);
    expect(email.sent).toHaveLength(1);
  });

  it('dedupKey collapses differing vars', async () => {
    await engine.notify(n('u', 'x', { v: 'a' }, { channel: 'email', dedupKey: 'K' }));
    await engine.notify(n('u', 'x', { v: 'b' }, { channel: 'email', dedupKey: 'K' }));
    expect(email.sent).toHaveLength(1);
  });

  it('retries with per-channel backoff then fails', async () => {
    email.scriptFailures({ failOnAttempts: [1, 2], error: 'smtp-503', retryable: true });
    const id = await engine.notify(n('u', 'x', { v: 'v' }, { channel: 'email' }));
    expect(engine.tracker.get(id!)!.state).toBe('deferred');
    // First retry due at base 60s; advance and flush — 2nd attempt also scripted fail
    clock.advance(60_001);
    await engine.flushRetries();
    expect(engine.tracker.get(id!)!.state).toBe('deferred');
    // backoff doubled → 120s; advance past it, 3rd attempt succeeds
    clock.advance(120_001);
    await engine.flushRetries();
    expect(engine.tracker.get(id!)!.state).toBe('sent');
    expect(email.sent).toHaveLength(1);
  });

  it('non-retryable failure marks failed immediately', async () => {
    email.scriptFailures({ failOnAttempts: [1], error: 'bad-recipient', retryable: false });
    const id = await engine.notify(n('u', 'x', { v: 'v' }, { channel: 'email' }));
    expect(engine.tracker.get(id!)!.state).toBe('failed');
  });

  it('digests collect into one summary send', async () => {
    engine.preferences.setPreference({ userId: 'u', topic: 'news', channel: 'email', rule: { effect: 'digest', every: 2 } });
    const a = await engine.notify(n('u', 'news', { v: '1' }, { channel: 'email', dedupKey: 'a' }));
    const b = await engine.notify(n('u', 'news', { v: '2' }, { channel: 'email', dedupKey: 'b' }));
    expect(engine.tracker.get(a!)!.state).toBe('digested');
    expect(engine.tracker.get(b!)!.state).toBe('digested');
    // Second item hit `every: 2` → digest email sent
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toContain('2');
  });

  it('quiet hours defer then flush sends after window', async () => {
    engine.preferences.setQuietHours({ userId: 'u', startHour: 12, endHour: 14 });
    const id = await engine.notify(n('u', 'promo', { v: 'v' }, { channel: 'email' }));
    expect(engine.tracker.get(id!)!.state).toBe('deferred');
    expect(email.sent).toHaveLength(0);
    clock.advance(2 * 3600_000 + 1); // past 14:00
    await engine.flushRetries();
    expect(email.sent).toHaveLength(1);
  });

  it('rejects notification with unregistered template', async () => {
    await expect(engine.notify(n('u', 'x', {}, { template: 'nope' }))).rejects.toThrow(DeliveryError);
  });
});
