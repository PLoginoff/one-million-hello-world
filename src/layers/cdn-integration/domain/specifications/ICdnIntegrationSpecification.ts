/**
 * ICdnIntegrationSpecification interface
 */

export interface ICdnIntegrationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification;
  or(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification;
  not(): ICdnIntegrationSpecification;
}
