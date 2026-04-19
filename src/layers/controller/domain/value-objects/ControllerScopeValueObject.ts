/**
 * Controller Scope Value Object
 * 
 * Represents controller scope for dependency injection.
 */

export enum ControllerScope {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient',
  REQUEST = 'request',
}

export class ControllerScopeValueObject {
  readonly scope: ControllerScope;

  private constructor(scope: ControllerScope) {
    this.scope = scope;
  }

  /**
   * Create singleton scope
   */
  static singleton(): ControllerScopeValueObject {
    return new ControllerScopeValueObject(ControllerScope.SINGLETON);
  }

  /**
   * Create transient scope
   */
  static transient(): ControllerScopeValueObject {
    return new ControllerScopeValueObject(ControllerScope.TRANSIENT);
  }

  /**
   * Create request scope
   */
  static request(): ControllerScopeValueObject {
    return new ControllerScopeValueObject(ControllerScope.REQUEST);
  }

  /**
   * Check if scope is singleton
   */
  isSingleton(): boolean {
    return this.scope === ControllerScope.SINGLETON;
  }

  /**
   * Check if scope is transient
   */
  isTransient(): boolean {
    return this.scope === ControllerScope.TRANSIENT;
  }

  /**
   * Check if scope is request
   */
  isRequest(): boolean {
    return this.scope === ControllerScope.REQUEST;
  }

  /**
   * Clone the value object
   */
  clone(): ControllerScopeValueObject {
    return new ControllerScopeValueObject(this.scope);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.scope;
  }

  /**
   * Check if two scopes are equal
   */
  equals(other: ControllerScopeValueObject): boolean {
    return this.scope === other.scope;
  }
}
