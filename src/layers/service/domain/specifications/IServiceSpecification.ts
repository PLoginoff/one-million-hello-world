/**
 * IServiceSpecification interface
 */

export interface IServiceSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IServiceSpecification): IServiceSpecification;
  or(other: IServiceSpecification): IServiceSpecification;
  not(): IServiceSpecification;
}
