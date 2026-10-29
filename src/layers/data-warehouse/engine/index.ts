/**
 * Data Warehouse Engine — public surface.
 *
 * Columnar storage, OLAP aggregation, star schemas, partition pruning
 * and materialized views.
 *
 * @module DataWarehouse/Engine
 */

export {
  BitVector,
  ColumnarTable,
  EncodedColumnChunk,
  RowGroup,
  compareScalars,
  evalPredicate,
} from './ColumnStorageEngine';
export type {
  ChunkStats,
  ColumnPredicate,
  ColumnSchema,
  ColumnType,
  ColumnarTableOptions,
  CompareOp,
  Encoding,
  Row,
  Scalar,
  ScanResult,
} from './ColumnStorageEngine';

export { OlapEngine } from './OlapEngine';
export type {
  AggregateFunction,
  AggregateRow,
  AggregateSpec,
  OlapResult,
  SortSpec,
} from './OlapEngine';

export { DimensionTable, FactTable, StarSchema } from './StarSchemaBuilder';
export type {
  DimensionSpec,
  DimensionUpsertResult,
  FactSpec,
  ScdType,
} from './StarSchemaBuilder';

export { BitmapIndex, BitmapIndexSet, RawBitmap } from './BitmapIndex';

export { MaterializedView, MaterializedViewCatalog, PartitionPruner } from './MaterializedView';
export type {
  MaterializedViewDef,
  PredicateTree,
  PruneResult,
  RefreshStrategy,
} from './MaterializedView';
