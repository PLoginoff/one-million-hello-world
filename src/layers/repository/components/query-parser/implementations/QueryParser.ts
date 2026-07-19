/**
 * Query Parser Implementation
 *
 * Concrete implementation of IQueryParser.
 * Handles parsing and validating query expressions.
 */

import { IQueryParser } from '../interfaces/IQueryParser';
import {
  ParseResult,
  ParsedQuery,
  ParserConfig,
  ParsedFilter,
  ParsedSort,
  ParsedPagination,
  ParsedAggregation,
  FilterOperator,
  LogicalOperator,
  SortDirection,
  NullPosition,
  AggregationFunction,
  ErrorSeverity,
} from '../types/query-parser-types';

export class QueryParser implements IQueryParser {
  private _config: ParserConfig;
  private _stats: {
    totalParses: number;
    successfulParses: number;
    failedParses: number;
    averageParseTime: number;
  };

  constructor(config?: Partial<ParserConfig>) {
    this._config = {
      enableValidation: true,
      maxDepth: 10,
      maxComplexity: 100,
      allowedFields: [],
      forbiddenFields: [],
      ...config,
    };
    this._stats = {
      totalParses: 0,
      successfulParses: 0,
      failedParses: 0,
      averageParseTime: 0,
    };
  }

  parse(query: string): ParseResult {
    const startTime = Date.now();
    this._stats.totalParses++;

    if (query === undefined) {
      this._stats.failedParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return {
        success: false,
        errors: [
          {
            code: 'PARSE_ERROR',
            message: 'Query is undefined',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }

    if (query.trim() === '') {
      this._stats.successfulParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return {
        success: true,
        query: {
          filters: [],
          sorts: [],
          pagination: { limit: 100, offset: 0 },
          projections: [],
          groups: [],
          aggregations: [],
        },
        errors: [],
        warnings: [],
      };
    }

    if (!this._config.enableValidation) {
      this._stats.successfulParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return {
        success: true,
        query: {
          filters: [],
          sorts: [],
          pagination: { limit: 100, offset: 0 },
          projections: [],
          groups: [],
          aggregations: [],
        },
        errors: [],
        warnings: [],
      };
    }

    try {
      const parsedQuery: ParsedQuery = {
        filters: [],
        sorts: [],
        pagination: { limit: 100, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      let remaining = query;

      const sortMatch = /\bsort\s+by\s+/i.exec(remaining);
      if (sortMatch) {
        const sortPart = remaining.substring(sortMatch.index + sortMatch[0].length).trim();
        const nextKeyword = /\b(limit|offset)\b/i.exec(sortPart);
        const sortExpression = nextKeyword ? sortPart.substring(0, nextKeyword.index).trim() : sortPart;
        parsedQuery.sorts.push(this._parseSortExpression(sortExpression));
        remaining = remaining.substring(0, sortMatch.index).trim();
      }

      const limitMatch = /\blimit\s+(\d+)/i.exec(query);
      const offsetMatch = /\boffset\s+(\d+)/i.exec(query);
      if (limitMatch ?? offsetMatch) {
        parsedQuery.pagination = {
          limit: limitMatch ? parseInt(limitMatch[1], 10) : 100,
          offset: offsetMatch ? parseInt(offsetMatch[1], 10) : 0,
        };
        remaining = remaining
          .replace(/\blimit\s+\d+/i, '')
          .replace(/\boffset\s+\d+/i, '')
          .trim();
      }

      if (remaining.length > 0 && !/^\s*limit\s+\d+/i.test(remaining) && !/^\s*offset\s+\d+/i.test(remaining)) {
        const filterExpressions = remaining.split(/\s+AND\s+|\s+OR\s+/i);
        for (let i = 0; i < filterExpressions.length; i++) {
          const expr = filterExpressions[i].trim();
          if (expr === '') continue;

          let testExpr = expr;
          let negated = false;
          if (testExpr.toUpperCase().startsWith('NOT ')) {
            negated = true;
            testExpr = testExpr.substring(4).trim();
          }

          const parts = testExpr.split(' ');
          if (parts.length < 2) {
            continue;
          }

          const op = parts[1].toUpperCase();
          if (!Object.values(FilterOperator).includes(op as FilterOperator)) {
            continue;
          }

          let logicalOperator = LogicalOperator.AND;
          if (i > 0) {
            const connector = remaining.match(
              new RegExp(`(\\s+AND\\s+|\\s+OR\\s+)${expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
            );
            if (connector) {
              logicalOperator = connector[1].trim().toUpperCase() === 'OR' ? LogicalOperator.OR : LogicalOperator.AND;
            }
          }

          const filter = this._parseFilterExpression(testExpr);
          filter.negated = negated;
          filter.logicalOperator = logicalOperator;
          parsedQuery.filters.push(filter);
        }
      }

      if (
        parsedQuery.filters.length === 0 &&
        parsedQuery.sorts.length === 0 &&
        limitMatch === null &&
        offsetMatch === null
      ) {
        throw new Error('Invalid query syntax');
      }

      const result: ParseResult = {
        success: true,
        query: parsedQuery,
        errors: [],
        warnings: [],
      };

      if (this._config.enableValidation) {
        const validationResult = this.validate(parsedQuery);
        if (!validationResult.success) {
          result.success = false;
          result.errors = validationResult.errors;
          this._stats.failedParses++;
        } else {
          this._stats.successfulParses++;
        }
      } else {
        this._stats.successfulParses++;
      }

      this._updateAverageParseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this._stats.failedParses++;
      this._updateAverageParseTime(Date.now() - startTime);

      return {
        success: false,
        errors: [
          {
            code: 'PARSE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown parse error',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }
  }

  parseFilter(expression: string): ParseResult {
    const startTime = Date.now();
    this._stats.totalParses++;

    try {
      const filter = this._parseFilterExpression(expression);

      const result: ParseResult = {
        success: true,
        query: {
          filters: [filter],
          sorts: [],
          pagination: { limit: 100, offset: 0 },
          projections: [],
          groups: [],
          aggregations: [],
        },
        errors: [],
        warnings: [],
      };

      this._stats.successfulParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this._stats.failedParses++;
      this._updateAverageParseTime(Date.now() - startTime);

      return {
        success: false,
        errors: [
          {
            code: 'FILTER_PARSE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown filter parse error',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }
  }

  parseSort(expression: string): ParseResult {
    const startTime = Date.now();
    this._stats.totalParses++;

    try {
      const sort = this._parseSortExpression(expression);

      const result: ParseResult = {
        success: true,
        query: {
          filters: [],
          sorts: [sort],
          pagination: { limit: 100, offset: 0 },
          projections: [],
          groups: [],
          aggregations: [],
        },
        errors: [],
        warnings: [],
      };

      this._stats.successfulParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this._stats.failedParses++;
      this._updateAverageParseTime(Date.now() - startTime);

      return {
        success: false,
        errors: [
          {
            code: 'SORT_PARSE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown sort parse error',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }
  }

  parsePagination(expression: string): ParseResult {
    const startTime = Date.now();
    this._stats.totalParses++;

    try {
      const pagination = this._parsePaginationExpression(expression);

      const result: ParseResult = {
        success: true,
        query: {
          filters: [],
          sorts: [],
          pagination,
          projections: [],
          groups: [],
          aggregations: [],
        },
        errors: [],
        warnings: [],
      };

      this._stats.successfulParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this._stats.failedParses++;
      this._updateAverageParseTime(Date.now() - startTime);

      return {
        success: false,
        errors: [
          {
            code: 'PAGINATION_PARSE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown pagination parse error',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }
  }

  parseAggregation(expression: string): ParseResult {
    const startTime = Date.now();
    this._stats.totalParses++;

    try {
      const aggregation = this._parseAggregationExpression(expression);

      const result: ParseResult = {
        success: true,
        query: {
          filters: [],
          sorts: [],
          pagination: { limit: 100, offset: 0 },
          projections: [],
          groups: [],
          aggregations: [aggregation],
        },
        errors: [],
        warnings: [],
      };

      this._stats.successfulParses++;
      this._updateAverageParseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this._stats.failedParses++;
      this._updateAverageParseTime(Date.now() - startTime);

      return {
        success: false,
        errors: [
          {
            code: 'AGGREGATION_PARSE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown aggregation parse error',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }
  }

  validate(query: ParsedQuery): ParseResult {
    const errors: Array<{ code: string; message: string; position: number; severity: ErrorSeverity }> = [];

    if (query?.filters == null) {
      return {
        success: false,
        errors: [
          {
            code: 'INVALID_QUERY',
            message: 'Query is null or undefined',
            position: 0,
            severity: ErrorSeverity.ERROR,
          },
        ],
        warnings: [],
      };
    }

    if (this._config.allowedFields.length > 0) {
      for (const filter of query.filters) {
        if (!this._config.allowedFields.includes(filter.field)) {
          errors.push({
            code: 'FORBIDDEN_FIELD',
            message: `Field '${filter.field}' is not allowed`,
            position: 0,
            severity: ErrorSeverity.ERROR,
          });
        }
      }
    }

    if (this._config.forbiddenFields.length > 0) {
      for (const filter of query.filters) {
        if (this._config.forbiddenFields.includes(filter.field)) {
          errors.push({
            code: 'FORBIDDEN_FIELD',
            message: `Field '${filter.field}' is forbidden`,
            position: 0,
            severity: ErrorSeverity.ERROR,
          });
        }
      }
    }

    const complexity = query.filters.length + query.sorts.length + query.aggregations.length;
    if (complexity > this._config.maxComplexity) {
      errors.push({
        code: 'COMPLEXITY_EXCEEDED',
        message: `Query complexity ${complexity} exceeds maximum ${this._config.maxComplexity}`,
        position: 0,
        severity: ErrorSeverity.ERROR,
      });
    }

    return {
      success: errors.length === 0,
      query,
      errors,
      warnings: [],
    };
  }

  serialize(query: ParsedQuery): string {
    if (query == null) {
      return '';
    }
    const filters = query.filters ?? [];
    const sorts = query.sorts ?? [];
    const pagination = query.pagination;

    const parts: string[] = [];

    if (filters.length > 0) {
      parts.push(filters.map((f) => `${f.field} ${f.operator} ${String(f.value)}`).join(' AND '));
    }

    if (sorts.length > 0) {
      parts.push(sorts.map((s) => `ORDER BY ${s.field} ${s.direction}`).join(', '));
    }

    if (pagination.limit > 0) {
      parts.push(`LIMIT ${pagination.limit}`);
    }

    if (pagination.offset > 0) {
      parts.push(`OFFSET ${pagination.offset}`);
    }

    return parts.join(' ');
  }

  setConfig(config: Partial<ParserConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): ParserConfig {
    return { ...this._config };
  }

  addAllowedField(field: string): void {
    if (!this._config.allowedFields.includes(field)) {
      this._config.allowedFields.push(field);
    }
  }

  removeAllowedField(field: string): void {
    this._config.allowedFields = this._config.allowedFields.filter((f) => f !== field);
  }

  addForbiddenField(field: string): void {
    if (!this._config.forbiddenFields.includes(field)) {
      this._config.forbiddenFields.push(field);
    }
  }

  removeForbiddenField(field: string): void {
    this._config.forbiddenFields = this._config.forbiddenFields.filter((f) => f !== field);
  }

  getAllowedFields(): string[] {
    return [...this._config.allowedFields];
  }

  getForbiddenFields(): string[] {
    return [...this._config.forbiddenFields];
  }

  resetConfig(): void {
    this._config = {
      enableValidation: true,
      maxDepth: 10,
      maxComplexity: 100,
      allowedFields: [],
      forbiddenFields: [],
    };
  }

  getStats(): {
    totalParses: number;
    successfulParses: number;
    failedParses: number;
    averageParseTime: number;
  } {
    return { ...this._stats };
  }

  private _parseFilterExpression(expression: string): ParsedFilter {
    const parts = expression.split(' ');
    if (parts.length < 2) {
      throw new Error('Invalid filter expression');
    }

    const field = parts[0];
    const operator = this._parseFilterOperator(parts[1]);
    const value = parts.slice(2).join(' ') ?? '';

    return {
      field,
      operator,
      value,
      negated: false,
      logicalOperator: LogicalOperator.AND,
    };
  }

  private _parseFilterOperator(operator: string): FilterOperator {
    const upper = operator.toUpperCase();
    if (Object.values(FilterOperator).includes(upper as FilterOperator)) {
      return upper as FilterOperator;
    }
    return FilterOperator.EQUALS;
  }

  private _parseSortExpression(expression: string): ParsedSort {
    const parts = expression.split(' ');
    const field = parts[0];
    const direction = parts.length > 1 ? this._parseSortDirection(parts[1]) : SortDirection.ASC;

    return {
      field,
      direction,
      nullPosition: NullPosition.LAST,
    };
  }

  private _parseSortDirection(direction: string): SortDirection {
    const upper = direction.toUpperCase();
    return upper === 'DESC' ? SortDirection.DESC : SortDirection.ASC;
  }

  private _parsePaginationExpression(expression: string): ParsedPagination {
    const parts = expression.split(',');
    const limit = parseInt(parts[0], 10) ?? 100;
    const offset = parseInt(parts[1], 10) ?? 0;

    return {
      limit,
      offset,
    };
  }

  private _parseAggregationExpression(expression: string): ParsedAggregation {
    const parts = expression.split('(');
    const func = this._parseAggregationFunction(parts[0]);
    const field = parts[1]?.replace(')', '').trim() ?? '*';

    return {
      function: func,
      field,
    };
  }

  private _parseAggregationFunction(func: string): AggregationFunction {
    const upper = func.toUpperCase();
    if (Object.values(AggregationFunction).includes(upper as AggregationFunction)) {
      return upper as AggregationFunction;
    }
    return AggregationFunction.COUNT;
  }

  private _updateAverageParseTime(duration: number): void {
    const effectiveDuration = Math.max(duration, 1);
    this._stats.averageParseTime =
      (this._stats.averageParseTime * (this._stats.totalParses - 1) + effectiveDuration) / this._stats.totalParses;
  }
}
