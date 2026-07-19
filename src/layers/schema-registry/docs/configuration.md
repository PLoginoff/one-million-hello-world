# Configuration: SchemaRegistry Layer

## Default Configuration
```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info"
}
```

## Configuration Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable/disable layer |
| timeout | number | 30000 | Operation timeout in ms |
| retries | number | 3 | Number of retry attempts |
| logLevel | string | "info" | Logging verbosity |

## Environment Variables
| Variable | Description |
|----------|-------------|
| SCHEMA_REGISTRY_ENABLED | Enable layer (default: true) |
| SCHEMA_REGISTRY_TIMEOUT | Timeout in ms |
