/**
 * ISecuritySpecification interface
 */

export interface ISecuritySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISecuritySpecification): ISecuritySpecification;
  or(other: ISecuritySpecification): ISecuritySpecification;
  not(): ISecuritySpecification;
}
