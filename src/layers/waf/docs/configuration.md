# Configuration: Waf Layer

## Waf options
`new Waf(options)` (`strategies/Waf.ts`):

| Option | Default | Description |
|--------|---------|-------------|
| `withDefaultRules` | true | Install the SQLi/XSS/path-traversal/RCE/header rule packs |
| `accessList` | new `IpAccessList()` | Preconfigured IP whitelist/blacklist |

Rules are managed through `WafRuleEngine.addRule(rule)` /
`removeRule(id)` / `rules()`. A `WafRule` has `id`, `name`, `priority`,
`action`, `score`, `ast`, optional `tags`, `disabled`.

## Default Configuration
Defaults are defined in `configuration/defaults/WafDefaults.ts`
as `DEFAULT_WAF_CONFIG`:

```typescript
export const DEFAULT_WAF_CONFIG: WafConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
```

## Configuration Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable/disable the layer |
| timeout | number | 30000 | Operation timeout in ms (validated 1,000–300,000) |
| retries | number | 3 | Retry attempts (validated 0–10) |
| logLevel | string | "info" | Logging verbosity (`debug`/`info`/`warn`/`error`) |
| strategy | string | "default" | Execution strategy: `default`, `fast`, `reliable`, `cached`, `batch` |

## Builder and Validator
- `WafConfigurationBuilder` (`configuration/builders/`) — fluent
  construction of the config object.
- `WafConfigurationValidator` (`configuration/validators/`) —
  returns `{ valid, errors, warnings }`; enforces the timeout/retries
  bounds and the strategy allowlist, warns on unknown `logLevel`.
