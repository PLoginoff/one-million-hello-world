/**
 * IFacadeSpecification interface
 */

export interface IFacadeSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IFacadeSpecification): IFacadeSpecification;
  or(other: IFacadeSpecification): IFacadeSpecification;
  not(): IFacadeSpecification;
}
