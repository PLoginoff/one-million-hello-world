# Configuration: Facade Layer

## FacadeConfig
`FacadeConfig` (`types/facade-types.ts`) has exactly two toggles:

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `enableAggregation` | boolean | `true` | Results from all operations collected into `FacadeResult.data[]` |
| `enableComposition` | boolean | `true` | Operations composed/tracked into `FacadeResult.operations[]` |

```ts
facade.setConfig({ enableAggregation: true });
facade.getConfig(); // merged FacadeConfig
```

`setConfig` merges partial config; `getConfig` returns a copy.

## Result shape
`FacadeResult<T>` always carries `operations: string[]` — the `operation_N` names of steps that ran before success/failure.

## Layer defaults
`DEFAULT_FACADE_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`FacadeConfigurationBuilder` and validators provide typed construction for layer-level config.
