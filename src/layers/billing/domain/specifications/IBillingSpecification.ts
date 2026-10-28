/**
 * IBillingSpecification interface
 */

export interface IBillingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IBillingSpecification): IBillingSpecification;
  or(other: IBillingSpecification): IBillingSpecification;
  not(): IBillingSpecification;
}
