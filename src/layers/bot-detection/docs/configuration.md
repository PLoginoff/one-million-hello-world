# Configuration: Bot Detection Layer

## Layer defaults

`configuration/defaults/BotDetectionDefaults.ts` exports
`DEFAULT_BOTDETECTION_CONFIG`:

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info"
}
```

Build with `BotDetectionConfigurationBuilder` (`with*` fluent methods);
`BotDetectionConfigurationValidator` enforces bounds. Apply via
`layer.configure(config)`.

## Aggregator thresholds (`AggregatorConfig`)

`new BotScoreAggregator(config)`:

| Option | Default | Meaning |
|--------|---------|---------|
| `humanBelow`        | `0.20` | score < → `human` |
| `likelyHumanBelow`  | `0.40` | score < → `likely-human` |
| `suspiciousBelow`   | `0.65` | score < → `suspicious`, else `bot` |
| `knownBotScore`     | `0.95` | single-signal score that forces `known-bot` |
| `knownBotConfidence`| `0.90` | required confidence for the override |

## Signal configs

- `RequestFrequencySignal(new FrequencyConfig { windowMs = 10_000,
  burstThreshold = 5, sustainedThreshold = 20 })` — events/sec.
- `TimingEntropySignal(new TimingConfig { history = 20, minSamples = 5,
  veryRegularCv = 0.05, suspiciousCv = 0.15 })`.
- `HoneypotSignal(new HoneypotConfig { fieldNames =
  ['email2','website','url','fax','phone2','hp_','comment_url'],
  legitimateHiddenFields = ['_csrf','csrf_token','authenticity_token',
  '_token'] })`.
- `UserAgentSignal` and `HeaderConsistencySignal` take no config;
  their pattern tables (`KNOWN_BOTS`, `SUSPICIOUS_UA_PATTERNS`) are
  exported constants if you need to inspect them.

## Wiring

```ts
const agg = new BotScoreAggregator();
agg.register(new UserAgentSignal());
agg.register(new RequestFrequencySignal());
agg.register(new TimingEntropySignal());
agg.register(new HeaderConsistencySignal());
agg.register(new HoneypotSignal());

const verdict = agg.score({
  clientIp: '1.2.3.4',
  userAgent: req.headers['user-agent'],
  headers: req.headers,
  at: Date.now(),
  honeypotFields: req.body,
});
```

Call `agg.tick(Date.now())` periodically to let stateful signals prune.
