/**
 * Middleware Execution Order Value Object
 * 
 * Represents execution order for middleware chain.
 */

export enum ExecutionOrder {
  FIRST = 'first',
  LAST = 'last',
  BEFORE = 'before',
  AFTER = 'after',
}

export class MiddlewareExecutionOrderValueObject {
  readonly order: ExecutionOrder;
  readonly referenceId?: string;

  private constructor(order: ExecutionOrder, referenceId?: string) {
    this.order = order;
    this.referenceId = referenceId;
  }

  /**
   * Create first execution order
   */
  static first(): MiddlewareExecutionOrderValueObject {
    return new MiddlewareExecutionOrderValueObject(ExecutionOrder.FIRST);
  }

  /**
   * Create last execution order
   */
  static last(): MiddlewareExecutionOrderValueObject {
    return new MiddlewareExecutionOrderValueObject(ExecutionOrder.LAST);
  }

  /**
   * Create before execution order
   */
  static before(referenceId: string): MiddlewareExecutionOrderValueObject {
    return new MiddlewareExecutionOrderValueObject(ExecutionOrder.BEFORE, referenceId);
  }

  /**
   * Create after execution order
   */
  static after(referenceId: string): MiddlewareExecutionOrderValueObject {
    return new MiddlewareExecutionOrderValueObject(ExecutionOrder.AFTER, referenceId);
  }

  /**
   * Check if order is first
   */
  isFirst(): boolean {
    return this.order === ExecutionOrder.FIRST;
  }

  /**
   * Check if order is last
   */
  isLast(): boolean {
    return this.order === ExecutionOrder.LAST;
  }

  /**
   * Check if order is before
   */
  isBefore(): boolean {
    return this.order === ExecutionOrder.BEFORE;
  }

  /**
   * Check if order is after
   */
  isAfter(): boolean {
    return this.order === ExecutionOrder.AFTER;
  }

  /**
   * Get reference ID
   */
  getReferenceId(): string | undefined {
    return this.referenceId;
  }

  /**
   * Clone the value object
   */
  clone(): MiddlewareExecutionOrderValueObject {
    return new MiddlewareExecutionOrderValueObject(this.order, this.referenceId);
  }

  /**
   * Convert to string
   */
  toString(): string {
    if (this.referenceId) {
      return `${this.order}:${this.referenceId}`;
    }
    return this.order;
  }

  /**
   * Check if two orders are equal
   */
  equals(other: MiddlewareExecutionOrderValueObject): boolean {
    return this.order === other.order && this.referenceId === other.referenceId;
  }
}
