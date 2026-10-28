/**
 * ITransportSpecification interface
 */

export interface ITransportSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ITransportSpecification): ITransportSpecification;
  or(other: ITransportSpecification): ITransportSpecification;
  not(): ITransportSpecification;
}
