/**
 * IWafSpecification interface
 */

export interface IWafSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IWafSpecification): IWafSpecification;
  or(other: IWafSpecification): IWafSpecification;
  not(): IWafSpecification;
}
