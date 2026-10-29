/**
 * Identity extended tests — GroupGraph nested membership, CredentialVault.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { GroupGraph } from '../core/GroupGraph';
import { CredentialVault } from '../core/CredentialVault';
import { randomBytes } from 'crypto';
import { IdentityCoreError } from '../core/types';

describe('GroupGraph', () => {
  let g: GroupGraph;
  beforeEach(() => {
    g = new GroupGraph();
    g.createGroup('eng', 'Engineering');
    g.createGroup('backend', 'Backend Team');
    g.createGroup('platform', 'Platform Team');
    g.addSubgroup('eng', 'backend');
    g.addSubgroup('eng', 'platform');
    g.addUser('backend', 'alice');
    g.addUser('platform', 'bob');
  });

  it('nested membership resolves transitively', () => {
    expect(g.isMember('eng', 'alice')).toBe(true);
    expect(g.isMember('eng', 'bob')).toBe(true);
    expect(g.isMember('backend', 'alice')).toBe(true);
    expect(g.isMember('backend', 'bob')).toBe(false);
    expect(g.members('eng').sort()).toEqual(['alice', 'bob']);
  });

  it('effectiveGroups walks ancestors', () => {
    const groups = g.effectiveGroups('alice').map((x) => x.id).sort();
    expect(groups).toEqual(['backend', 'eng']);
  });

  it('rejects cycles', () => {
    g.createGroup('top', 'Top');
    g.addSubgroup('top', 'eng');
    // eng is under top; putting top under eng would cycle
    expect(() => g.addSubgroup('eng', 'top')).toThrow(IdentityCoreError);
    expect(() => g.addSubgroup('eng', 'eng')).toThrow(IdentityCoreError);
  });

  it('diamond nesting is fine (no cycle, no double-count)', () => {
    g.createGroup('senior', 'Senior ICs');
    g.addSubgroup('senior', 'backend');
    g.addSubgroup('senior', 'platform');
    expect(g.members('senior').sort()).toEqual(['alice', 'bob']);
    expect(g.effectiveGroups('alice').map((x) => x.id).sort()).toEqual(['backend', 'eng', 'senior']);
  });

  it('deleteGroup unlinks from parents', () => {
    g.deleteGroup('backend');
    expect(g.isMember('eng', 'alice')).toBe(false);
  });
});

describe('CredentialVault', () => {
  it('encrypts/decrypts fields with AAD binding', () => {
    const v = new CredentialVault();
    v.addKey('k1', randomBytes(32));
    const env = v.encrypt('ssn', '000-00-0000');
    expect(env.startsWith('v1:k1:')).toBe(true);
    expect(v.decrypt('ssn', env)).toBe('000-00-0000');
    // Field transplant fails (AAD mismatch)
    expect(() => v.decrypt('dob', env)).toThrow(IdentityCoreError);
    // Tampered ciphertext fails
    const parts = env.split(':');
    const raw = Buffer.from(parts[3], 'base64url');
    raw[0] ^= 0xff;
    expect(() => v.decrypt('ssn', `v1:k1:${parts[2]}:${raw.toString('base64url')}`)).toThrow(IdentityCoreError);
  });

  it('key rotation keeps old fields readable, reencrypt upgrades', () => {
    const v = new CredentialVault();
    v.addKey('k1', randomBytes(32));
    const old = v.encrypt('ssn', '111');
    v.addKey('k2', randomBytes(32));
    expect(v.activeKid).toBe('k2');
    expect(v.decrypt('ssn', old)).toBe('111'); // still readable via embedded kid
    const upgraded = v.reencrypt('ssn', old);
    expect(upgraded.startsWith('v1:k2:')).toBe(true);
    expect(v.decrypt('ssn', upgraded)).toBe('111');
  });

  it('encryptAttributes wraps only listed fields', () => {
    const v = new CredentialVault();
    v.addKey('k1', randomBytes(32));
    const out = v.encryptAttributes({ ssn: '123', hobby: 'ski' }, ['ssn']);
    expect(CredentialVault.isEnvelope(out['ssn'])).toBe(true);
    expect(out['hobby']).toBe('ski');
    const back = v.decryptAttributes(out, ['ssn']);
    expect(back['ssn']).toBe('123');
  });
});
