# Testing: Waf Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/RuleEngine.test.ts` | `WafRuleEngine`: priority ordering, and/or/not AST evaluation, first-match vs `log` rules, disabled rules |
| `__tests__/Matchers.test.ts` | Transforms, `extractTarget` (path/query/body/headers), `compileCondition` match kinds |
| `__tests__/AttackRules.test.ts` | Built-in packs end-to-end: SQLi, XSS, path traversal, RCE, header rules, ACL integration, request-smuggling guard |
| `__tests__/IpAccessList.test.ts` | Exact + CIDR whitelist/blacklist, whitelist precedence, longest-prefix match |
| `__tests__/Waf.test.ts` | `Waf` facade + `inspect()` verdicts |
| `__tests__/WafStrategies.test.ts` | Generic strategies + `WafStrategyFactory` |
| `__tests__/WafConfiguration.test.ts` | `WafConfigurationBuilder`, `WafConfigurationValidator` |

## Running Tests

```bash
bun test ./src/layers/waf/
```

Single file:

```bash
bun test ./src/layers/waf/__tests__/AttackRules.test.ts
```

Tests use `bun:test`. Inspection is pure in-memory — no HTTP server or
network required.
