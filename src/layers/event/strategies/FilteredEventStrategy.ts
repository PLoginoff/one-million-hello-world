/**
 * EventFilteredStrategy
 *
 * Filtered event strategy that applies predicates to determine
 * whether an event should be processed or routed to specific handlers.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Filter predicate function type.
 */
export type EventFilterPredicate<T = unknown> = (context: EventStrategyContext) => boolean | Promise<boolean>;

/**
 * Filter action type.
 */
export type FilterAction = 'allow' | 'deny' | 'transform';

/**
 * Filter rule definition.
 */
export interface FilterRule<T = unknown> {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Predicate function to evaluate */
  predicate: EventFilterPredicate<T>;
  /** Action to take when predicate matches */
  action: FilterAction;
  /** Priority for rule evaluation (higher = evaluated first) */
  priority: number;
  /** Optional transformation function for 'transform' action */
  transform?: (context: EventStrategyContext) => EventStrategyContext | Promise<EventStrategyContext>;
  /** Whether this rule is enabled */
  enabled: boolean;
}

/**
 * Configuration options for the filtered strategy.
 */
export interface FilteredStrategyConfig {
  /** Default action when no rules match */
  defaultAction: FilterAction;
  /** Whether to stop evaluating rules after first match */
  stopOnFirstMatch: boolean;
  /** Whether to allow async predicates */
  allowAsyncPredicates: boolean;
}

/**
 * Default configuration for filtered strategy.
 */
export const DEFAULT_FILTERED_CONFIG: FilteredStrategyConfig = {
  defaultAction: 'allow',
  stopOnFirstMatch: false,
  allowAsyncPredicates: true,
};

/**
 * Filtered event strategy implementation.
 * Applies filter rules to determine event processing behavior.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventFilteredStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'filtered';

  /** @inheritdoc */
  public readonly priority = 12;

  private readonly _config: FilteredStrategyConfig;
  private readonly _rules: FilterRule<T>[];
  private readonly _wrappedStrategy: IEventStrategy<T>;
  private _executionCount: number;
  private _filterMatches: Map<string, number>;

  /**
   * Creates a new EventFilteredStrategy instance.
   *
   * @param wrappedStrategy - The base strategy to wrap with filtering
   * @param config - Optional configuration for filter behavior
   */
  constructor(wrappedStrategy: IEventStrategy<T>, config: Partial<FilteredStrategyConfig> = {}) {
    this._wrappedStrategy = wrappedStrategy;
    this._config = { ...DEFAULT_FILTERED_CONFIG, ...config };
    this._rules = [];
    this._executionCount = 0;
    this._filterMatches = new Map();
  }

  /**
   * Adds a filter rule.
   *
   * @param rule - The filter rule to add
   * @returns This strategy for chaining
   */
  public addRule(rule: FilterRule<T>): this {
    this._rules.push(rule);
    // Sort by priority (highest first)
    this._rules.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Removes a filter rule by ID.
   *
   * @param ruleId - The rule ID to remove
   * @returns True if rule was removed, false if not found
   */
  public removeRule(ruleId: string): boolean {
    const index = this._rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      this._rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Gets all filter rules.
   *
   * @returns Array of filter rules
   */
  public getRules(): FilterRule<T>[] {
    return [...this._rules];
  }

  /**
   * Enables or disables a rule.
   *
   * @param ruleId - The rule ID
   * @param enabled - Whether to enable the rule
   * @returns True if rule was found and updated
   */
  public setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this._rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return this._wrappedStrategy.canHandle(context);
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();

    // Evaluate filter rules
    const filterResult = await this._evaluateFilters(context);

    if (!filterResult.allowed) {
      return {
        success: false,
        error: {
          code: 'FILTER_DENIED',
          message: `Event filtered out by rule: ${filterResult.matchedRule?.name ?? 'default'}`,
          details: { matchedRuleId: filterResult.matchedRule?.id, action: filterResult.action },
        },
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          filtered: true,
          matchedRule: filterResult.matchedRule?.id,
        },
      };
    }

    // Apply transformation if needed
    const finalContext = filterResult.transformedContext ?? context;

    // Execute wrapped strategy
    const result = await this._wrappedStrategy.execute(finalContext);

    this._executionCount++;

    return {
      ...result,
      metadata: {
        ...result.metadata,
        strategyName: this.name,
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
        filtered: true,
        matchedRule: filterResult.matchedRule?.id,
        transformed: filterResult.transformedContext !== undefined,
      },
    };
  }

  /**
   * Evaluates all filter rules against the context.
   */
  private async _evaluateFilters(context: EventStrategyContext): Promise<{
    allowed: boolean;
    action: FilterAction;
    matchedRule?: FilterRule<T>;
    transformedContext?: EventStrategyContext;
  }> {
    let transformedContext: EventStrategyContext | undefined;
    let matchedRule: FilterRule<T> | undefined;
    let finalAction = this._config.defaultAction;

    for (const rule of this._rules) {
      if (!rule.enabled) continue;

      let matches: boolean;
      try {
        if (this._config.allowAsyncPredicates) {
          matches = await rule.predicate(context);
        } else {
          matches = rule.predicate(context) as boolean;
        }
      } catch (error) {
        // Treat predicate errors as non-matching
        continue;
      }

      if (matches) {
        matchedRule = rule;
        finalAction = rule.action;

        // Track match count
        const count = this._filterMatches.get(rule.id) ?? 0;
        this._filterMatches.set(rule.id, count + 1);

        if (rule.action === 'transform' && rule.transform) {
          transformedContext = await rule.transform(transformedContext ?? context);
        }

        if (this._config.stopOnFirstMatch) {
          break;
        }
      }
    }

    return {
      allowed: finalAction !== 'deny',
      action: finalAction,
      matchedRule,
      transformedContext,
    };
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  public getExecutionCount(): number {
    return this._executionCount;
  }

  /**
   * Gets the number of matches for a specific rule.
   *
   * @param ruleId - The rule ID
   * @returns The match count
   */
  public getRuleMatchCount(ruleId: string): number {
    return this._filterMatches.get(ruleId) ?? 0;
  }

  /**
   * Gets match counts for all rules.
   *
   * @returns Map of rule IDs to match counts
   */
  public getAllRuleMatchCounts(): Map<string, number> {
    return new Map(this._filterMatches);
  }

  /**
   * Gets the wrapped strategy.
   *
   * @returns The wrapped strategy
   */
  public getWrappedStrategy(): IEventStrategy<T> {
    return this._wrappedStrategy;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The configuration
   */
  public getConfig(): FilteredStrategyConfig {
    return { ...this._config };
  }
}

/**
 * Creates a filter predicate for event name matching.
 *
 * @param eventNames - Event names to match (supports wildcards with *)
 * @returns Filter predicate function
 */
export function createEventNameFilter(eventNames: string[]): EventFilterPredicate {
  const patterns = eventNames.map((name) => {
    const escaped = name.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });

  return (context: EventStrategyContext) => {
    return patterns.some((pattern) => pattern.test(context.eventName));
  };
}

/**
 * Creates a filter predicate for payload property matching.
 *
 * @param property - Property path (dot notation)
 * @param value - Value to match
 * @returns Filter predicate function
 */
export function createPayloadFilter(property: string, value: unknown): EventFilterPredicate {
  return (context: EventStrategyContext) => {
    if (!context.payload || typeof context.payload !== 'object') return false;

    const obj = context.payload as Record<string, unknown>;
    const keys = property.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return false;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current === value;
  };
}

/**
 * Creates a filter predicate for correlation ID matching.
 *
 * @param correlationIds - Correlation IDs to match
 * @returns Filter predicate function
 */
export function createCorrelationIdFilter(correlationIds: string[]): EventFilterPredicate {
  const idSet = new Set(correlationIds);
  return (context: EventStrategyContext) => {
    return context.correlationId !== undefined && idSet.has(context.correlationId);
  };
}