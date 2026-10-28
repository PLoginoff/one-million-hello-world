/**
 * IStrategySpecification interface
 */

export interface IStrategySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IStrategySpecification): IStrategySpecification;
  or(other: IStrategySpecification): IStrategySpecification;
  not(): IStrategySpecification;
}
