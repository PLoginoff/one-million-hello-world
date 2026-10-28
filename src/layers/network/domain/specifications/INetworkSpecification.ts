/**
 * INetworkSpecification interface
 */

export interface INetworkSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: INetworkSpecification): INetworkSpecification;
  or(other: INetworkSpecification): INetworkSpecification;
  not(): INetworkSpecification;
}
