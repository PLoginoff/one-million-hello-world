/**
 * Signed URL tests + SchemaNormalizer + ThroughputTracker.
 */

import { describe, it, expect } from 'bun:test';
import { SignedUrl } from '../cdn/SignedUrl';

describe('SignedUrl', () => {
  const signer = new SignedUrl('test-secret');

  it('signs and verifies a canned URL', () => {
    const url = signer.sign('/media/movie.mp4', 60_000);
    expect(url).toContain('expires=60000');
    expect(url).toContain('sig=');
    const r = signer.verify(url, 30_000);
    expect(r.ok).toBe(true);
  });

  it('rejects expired URLs and tampered paths', () => {
    const url = signer.sign('/a', 1_000);
    expect(signer.verify(url, 2_000).reason).toBe('expired');
    // Swap path -> signature won't match
    const tampered = url.replace('/a', '/b');
    expect(signer.verify(tampered, 500).reason).toBe('bad_signature');
    // Tamper with signature
    const bad = url.replace(/sig=[^&]+/, 'sig=forged');
    expect(signer.verify(bad, 500).reason).toBe('bad_signature');
  });

  it('ip-bound URLs enforce client IP', () => {
    const url = signer.sign('/private', 60_000, '1.2.3.4');
    expect(signer.verify(url, 0, '1.2.3.4').ok).toBe(true);
    expect(signer.verify(url, 0, '9.9.9.9').reason).toBe('ip_mismatch');
    expect(signer.verify(url, 0).reason).toBe('ip_mismatch');
  });

  it('policy signature covers a path prefix', () => {
    const signer2 = new SignedUrl('s');
    const qs = signer2.signPolicy({ resource: '/media/', expires: 60_000 });
    expect(signer2.verifyPolicy('/media/a/b.mp4', qs, 0).ok).toBe(true);
    expect(signer2.verifyPolicy('/other/x', qs, 0).reason).toBe('path_outside_policy');
    expect(signer2.verifyPolicy('/media/x', qs, 70_000).reason).toBe('expired');
    // Tampered policy body
    const bad = qs.replace(/policy=[^&]+/, 'policy=AAAA');
    expect(signer2.verifyPolicy('/media/x', bad, 0).reason).toBe('bad_signature');
  });
});
