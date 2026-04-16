# Query Builder Documentation

## Overview
The Query Builder provides a fluent API for building complex database queries with support for filtering, sorting, and pagination.

## Architecture

### Components
1. **IQueryBuilder Interface**: Defines the contract for query building operations
2. **QueryBuilder Implementation**: Concrete implementation with fluent API
3. **Query Builder Types**: Type definitions for query state and configuration

### Key Features

**Fluent API**
- Method chaining for building queries
- Immutable query state
- Reset functionality for reusability

**Filtering**
- Multiple filter operators (EQUALS, NOT_EQUALS, CONTAINS, etc.)
- Support for AND/OR conditions
- Nested condition groups

**Sorting**
- Multi-field sorting
- ASC/DESC direction support
- Stable sort order

**Pagination**
- Limit with validation
- Offset support
- Configurable max limits

**Configuration**
- Max limit enforcement
- Default limit setting
- Validation toggle

## Usage Example

```typescript
import { QueryBuilder } from './implementations/QueryBuilder';

const builder = new QueryBuilder({ maxLimit: 100 });

const query = builder
  .where('status', 'EQUALS', 'active')
  .andWhere('age', 'GREATER_THAN', 18)
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .offset(20)
  .build();
```

## API Reference

### IQueryBuilder Methods

- `where(field, operator, value)`: Add WHERE clause
- `andWhere(field, operator, value)`: Add AND condition
- `orWhere(field, operator, value)`: Add OR condition
- `orderBy(field, direction)`: Add sort order
- `limit(limit)`: Set result limit
- `offset(offset)`: Set result offset
- `build()`: Build query options
- `reset()`: Reset query builder
- `getFilters()`: Get current filters
- `getSorts()`: Get current sorts
- `getLimit()`: Get current limit
- `getOffset()`: Get current offset

## Filter Operators

- `EQUALS`: Field equals value
- `NOT_EQUALS`: Field does not equal value
- `CONTAINS`: String contains substring
- `STARTS_WITH`: String starts with substring
- `ENDS_WITH`: String ends with substring
- `GREATER_THAN`: Numeric greater than
- `LESS_THAN`: Numeric less than
- `GREATER_THAN_OR_EQUALS`: Numeric greater or equal
- `LESS_THAN_OR_EQUALS`: Numeric less or equal
- `IN`: Value in array
- `NOT_IN`: Value not in array

## Configuration Options

```typescript
interface QueryBuilderConfig {
  maxLimit?: number;        // Maximum allowed limit (default: 1000)
  defaultLimit?: number;   // Default limit if none specified (default: 100)
  enableValidation?: boolean; // Enable limit validation (default: true)
}
```

## Best Practices

1. **Reuse Builders**: Reset and reuse builder instances
2. **Validate Limits**: Use maxLimit to prevent excessive queries
3. **Chain Methods**: Leverage fluent API for readability
4. **Set Defaults**: Configure default limits for consistency
5. **Enable Validation**: Keep validation enabled for production

## Error Handling

The Query Builder validates:
- Limit values (non-negative, within max)
- Operator parsing (defaults to EQUALS if invalid)
- Direction parsing (defaults to ASC if invalid)
