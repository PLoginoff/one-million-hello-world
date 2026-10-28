/**
 * IDecoratorSpecification interface
 */

export interface IDecoratorSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDecoratorSpecification): IDecoratorSpecification;
  or(other: IDecoratorSpecification): IDecoratorSpecification;
  not(): IDecoratorSpecification;
}
