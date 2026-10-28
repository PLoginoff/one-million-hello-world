/**
 * IApiGatewaySpecification interface
 */

export interface IApiGatewaySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IApiGatewaySpecification): IApiGatewaySpecification;
  or(other: IApiGatewaySpecification): IApiGatewaySpecification;
  not(): IApiGatewaySpecification;
}
