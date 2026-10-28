/**
 * IMultiTenancySpecification interface
 */

export interface IMultiTenancySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMultiTenancySpecification): IMultiTenancySpecification;
  or(other: IMultiTenancySpecification): IMultiTenancySpecification;
  not(): IMultiTenancySpecification;
}
