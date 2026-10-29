# ADR: Waf Layer

## Status
Accepted

## Context
Inbound HTTP needs declarative, composable attack-signature filtering —
the kind mod_security and AWS WAF provide — implemented in-process with
no external rule service.

## Decisions

### 1. Rules are ASTs, not raw regexes
Each `WafRule` carries a `RuleAst` (`and`/`or`/`not` over atomic
conditions). Rules stay data — composable, serializable, and testable —
while `WafRuleEngine` compiles the AST once at install time into
closures (`CompiledMatcher`). Evaluation is short-circuit.

### 2. First-match-wins semantics with `log` pass-through
Rules run in priority order (high → low); the first matching
non-`log` rule's action decides the verdict. `log` rules observe and
annotate without terminating the chain — the iptables/mod_security
`chain` model operators already know.

### 3. Match-time transforms
Conditions apply named transforms (`urldecode`, `normalize-path`,
`strip-whitespace`, case changes) before matching, defeating trivial
evasion by encoding — a single rule covers raw and encoded payloads.

### 4. IP gating before rules
`IpAccessList` runs first as a cheap CIDR gate; whitelist entries always
beat blacklist ("allow ops, block known bots"). A dedicated guard also
blocks `Transfer-Encoding` + `Content-Length` smuggling before rules
see the request.

### 5. Curated regex rule packs over a parser
SQLi/XSS/traversal/RCE detection targets the *syntactic markers* of
attacks (union-select, `../`, backticks, event handlers) rather than
parsing SQL/HTML/shell. Stable rule IDs and OWASP tags make verdicts
attributable. `withDefaultRules: false` allows a fully custom set.

## Consequences
- Deterministic, in-memory inspection — every verdict carries matched
  rules, locations, and evidence for audit.
- Regex-based detection can false-positive on aggressive input; scores
  and `log` rules let operators tune before enforcing `block`.
