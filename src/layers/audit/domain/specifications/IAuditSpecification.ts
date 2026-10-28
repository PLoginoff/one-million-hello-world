/**
 * IAuditSpecification interface
 */

export interface IAuditSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IAuditSpecification): IAuditSpecification;
  or(other: IAuditSpecification): IAuditSpecification;
  not(): IAuditSpecification;
}
