# Waf Layer Architecture

## Position
Layer 73

## Responsibility
Web Application Firewall. Inspects `HttpRequest` objects against a
priority-ordered rule set and an IP access list, returning a `WafVerdict`
(`allow` | `log` | `block` | `redirect` | `captcha`) with matched rules,
score, and human-readable reasons.

## Request pipeline (`strategies/Waf.ts`)
`Waf.inspect(request)` runs three stages:

1. **IP access list** (`IpAccessList`) — exact + CIDR whitelist/blacklist
   with longest-prefix match; whitelist beats blacklist; `neutral` falls
   through to rules.
2. **Smuggling guard** — `Transfer-Encoding` + `Content-Length` together
   → block.
3. **Rule engine** (`WafRuleEngine`) — first non-`log` match wins; `log`
   rules annotate without terminating the chain.

## Rule model (`types/http.ts`)
- `WafRule` — `id`, `name`, `priority` (higher runs first), `action`,
  `score` (0..1), `ast`, `tags`, `disabled`.
- `RuleAst` — boolean tree: `condition` leaves composed with
  `and`/`or`/`not` (short-circuit).
- `RuleCondition` — `target` (`path`, `query`, `body`, `method`,
  `clientIp`, `header:<name>`), `kind` (`regex`, `contains`, `equals`,
  `startsWith`, `endsWith`, `ip-in-list`), `pattern`, `ignoreCase`,
  `transforms` (`lowercase`, `uppercase`, `urldecode`, `normalize-path`,
  `strip-whitespace`).
- `Matchers.ts` compiles each condition once at install time into a
  `CompiledMatcher` closure.

## Built-in rule packs (`strategies/`)
| Pack | Coverage |
|------|----------|
| `SqlInjectionRules` | union-select, comment-tail truncation, stacked queries, tautology auth bypass, benchmark/sleep, DBMS function names (OWASP A03) |
| `XssRules` | script/event-handler/URI-scheme payload markers |
| `PathTraversalRules` | `../`, encoded traversal, absolute-path probes |
| `RceRules` | shell metacharacters, command substitution, interpreter invocations |
| `HeaderInspectionRules` | hostile/forged headers |
| `IpAccessList` | IPv4 exact + CIDR lists |

Rule IDs are stable (e.g. `sqli-<name>`) and tagged (e.g. `owasp-a03`).
`Waf({ withDefaultRules: false })` skips the packs for a custom rule set.

## Layer scaffold
- `Waf` facade + `IWaf` — generic `execute(context)` contract.
- Five strategies (`WafDefault/Fast/Reliable/Cached/Batch`) +
  `WafStrategyFactory`; `WafStrategy.ts` holds the shared contract.
- `domain/` — entities, value objects, services, repository,
  specifications, policies, pipeline, decorators, handlers,
  `WafExecuted`/`WafFailed` events.
- Adapters: `InMemoryAdapter`, `MockAdapter`, `StubAdapter`.
- Cross-cutting: `WafHealthCheck`, `WafMetricsCollector`,
  `WafPrometheusMetricsCollector`, `WafError`/`WafErrorMapper`.

## Testing
See `testing.md`.
