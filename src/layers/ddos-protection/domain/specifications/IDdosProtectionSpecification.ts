/**
 * IDdosProtectionSpecification interface
 */

export interface IDdosProtectionSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDdosProtectionSpecification): IDdosProtectionSpecification;
  or(other: IDdosProtectionSpecification): IDdosProtectionSpecification;
  not(): IDdosProtectionSpecification;
}
