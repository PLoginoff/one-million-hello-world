# Configuration: DataWarehouse Layer

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
| DATA_WAREHOUSE_ENABLED | Enable layer (default: true) |
| DATA_WAREHOUSE_TIMEOUT | Timeout in ms |
