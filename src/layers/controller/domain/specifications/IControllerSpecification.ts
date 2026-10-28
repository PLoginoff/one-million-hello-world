/**
 * IControllerSpecification interface
 */

export interface IControllerSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IControllerSpecification): IControllerSpecification;
  or(other: IControllerSpecification): IControllerSpecification;
  not(): IControllerSpecification;
}
