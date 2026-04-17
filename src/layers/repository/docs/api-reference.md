# API Reference

## Data Access Layer
- `create(entity: T): Promise<void>` - Create new entity
- `findById(id: string): Promise<T | null>` - Find entity by ID
- `find(filter: Filter): Promise<T[]>` - Find entities matching filter
- `update(id: string, data: Partial<T>): Promise<void>` - Update entity
- `delete(id: string): Promise<void>` - Delete entity
- `bulkCreate(entities: T[]): Promise<void>` - Create multiple entities
- `bulkDelete(ids: string[]): Promise<void>` - Delete multiple entities
- `createSnapshot(): Snapshot` - Create data snapshot
- `restoreSnapshot(snapshot: Snapshot): void` - Restore from snapshot
- `getStats(): Stats` - Get storage statistics

## Cache Layer
- `set(key: string, value: T, ttl?: number): Promise<void>` - Set value in cache
- `get(key: string): Promise<T | null>` - Get value from cache
- `delete(key: string): Promise<void>` - Delete value from cache
- `invalidate(pattern: string): Promise<void>` - Invalidate keys matching pattern
- `clear(): Promise<void>` - Clear all cache entries
- `warm(entries: Map<string, T>): Promise<void>` - Warm cache with entries
- `getStats(): Stats` - Get cache statistics

## Transaction Manager
- `beginTransaction(config: TransactionConfig): Promise<Transaction>` - Begin new transaction
- `commit(transactionId: string): Promise<void>` - Commit transaction
- `rollback(transactionId: string): Promise<void>` - Rollback transaction
- `getTransaction(transactionId: string): Transaction | null` - Get transaction by ID
- `executeOperation(transactionId: string, operation: Operation): Promise<void>` - Execute operation within transaction
- `cleanup(): void` - Clean up expired transactions
- `getStats(): Stats` - Get transaction statistics

## Query Parser
- `parse(queryString: string): ParsedQuery` - Parse query string
- `validate(query: ParsedQuery): ValidationResult` - Validate parsed query
- `serialize(query: ParsedQuery): string` - Serialize query to string
- `getStats(): Stats` - Get parser statistics

## Filter Engine
- `apply(data: T[], filter: Filter): T[]` - Apply filter to data
- `compile(filter: Filter): CompiledFilter` - Compile filter for performance
- `optimize(filter: Filter): Filter` - Optimize filter
- `getStats(): Stats` - Get filter statistics

## Sort Engine
- `apply(data: T[], sort: Sort | Sort[]): T[]` - Apply sort to data
- `compile(sort: Sort | Sort[]): CompiledSort` - Compile sort for performance
- `estimateCost(sort: Sort | Sort[]): number` - Estimate sort cost
- `getStats(): Stats` - Get sort statistics

## Pagination Engine
- `applyOffset(data: T[], offset: number, limit: number): T[]` - Apply offset pagination
- `applyCursor(data: T[], cursor: string, limit: number, field: string): T[]` - Apply cursor pagination
- `applyPage(data: T[], page: number, pageSize: number): T[]` - Apply page-based pagination
- `getPaginationInfo(data: T[], offset: number, limit: number): PaginationInfo` - Get pagination metadata
- `getStats(): Stats` - Get pagination statistics

## Query Builder
- `where(field: string, operator: string, value: unknown): QueryBuilder` - Add where clause
- `andWhere(field: string, operator: string, value: unknown): QueryBuilder` - Add AND clause
- `orWhere(field: string, operator: string, value: unknown): QueryBuilder` - Add OR clause
- `orderBy(field: string, direction: string): QueryBuilder` - Add order by clause
- `limit(limit: number): QueryBuilder` - Set limit
- `offset(offset: number): QueryBuilder` - Set offset
- `build(): Query` - Build query
- `reset(): QueryBuilder` - Reset builder
- `clone(): QueryBuilder` - Clone builder

## Validation Layer
- `addRule(rule: ValidationRule): void` - Add validation rule
- `addRules(rules: ValidationRule[]): void` - Add multiple validation rules
- `removeRule(field: string): void` - Remove validation rule
- `clearRules(): void` - Clear all validation rules
- `validate(entity: T): ValidationResult` - Validate entity
- `validateField(field: string, value: unknown): ValidationResult` - Validate field
- `getStats(): Stats` - Get validation statistics

## Middleware Layer
- `use(middleware: MiddlewareFunction): void` - Add middleware
- `remove(middleware: MiddlewareFunction): void` - Remove middleware
- `clear(): void` - Clear all middleware
- `execute(context: Context): Promise<Result>` - Execute middleware pipeline
- `getStats(): Stats` - Get middleware statistics

## Metrics Layer
- `increment(name: string, value: number, tags?: Tags): void` - Increment counter
- `decrement(name: string, value: number, tags?: Tags): void` - Decrement counter
- `gauge(name: string, value: number, tags?: Tags): void` - Set gauge value
- `histogram(name: string, value: number, tags?: Tags): void` - Record histogram value
- `time(name: string, fn: () => Promise<void>): Promise<void>` - Time function execution
- `get(name: string): number | null` - Get metric value
- `getAll(): Map<string, number>` - Get all metrics
- `reset(name: string): void` - Reset specific metric
- `resetAll(): void` - Reset all metrics
- `export(): ExportedMetrics` - Export metrics

## Handler Layer
- `createContext(operation: string, metadata?: Metadata): HandlerContext` - Create handler context
- `handle(context: HandlerContext): Promise<HandlerResult>` - Handle operation
- `handleFind(context: HandlerContext): Promise<HandlerResult>` - Handle find operation
- `handleSave(entity: T, context: HandlerContext): Promise<HandlerResult>` - Handle save operation
- `handleDelete(id: string, context: HandlerContext): Promise<HandlerResult>` - Handle delete operation
- `use(middleware: MiddlewareFunction): void` - Add middleware
- `getStats(): Stats` - Get handler statistics

## Repository Facade
- `findById(id: string): Promise<T | null>` - Find entity by ID
- `find(query: Query): Promise<T[]>` - Find entities matching query
- `save(entity: T): Promise<T>` - Save entity
- `delete(id: string): Promise<void>` - Delete entity
- `count(query: Query): Promise<number>` - Count entities
- `exists(id: string): Promise<boolean>` - Check if entity exists
- `getQueryBuilder(): QueryBuilder` - Get query builder
- `beginTransaction(): Promise<Transaction>` - Begin transaction
- `commitTransaction(transactionId: string): Promise<void>` - Commit transaction
- `rollbackTransaction(transactionId: string): Promise<void>` - Rollback transaction
- `clearCache(): void` - Clear cache
- `getConfig(): FacadeConfig` - Get facade configuration
- `setConfig(config: Partial<FacadeConfig>): void` - Set facade configuration
- `getStats(): Stats` - Get facade statistics
- `healthCheck(): HealthCheckResult` - Perform health check
