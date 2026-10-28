/**
 * IReadModelSpecification interface
 */

export interface IReadModelSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IReadModelSpecification): IReadModelSpecification;
  or(other: IReadModelSpecification): IReadModelSpecification;
  not(): IReadModelSpecification;
}
