/**
 * ApiGatewayNotSpecification
 */

import { IApiGatewaySpecification } from './IApiGatewaySpecification';
import { ApiGatewayAndSpecification } from './ApiGatewayAndSpecification';
import { ApiGatewayOrSpecification } from './ApiGatewayOrSpecification';

export class ApiGatewayNotSpecification implements IApiGatewaySpecification {
  private _spec: IApiGatewaySpecification;

  constructor(spec: IApiGatewaySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IApiGatewaySpecification): IApiGatewaySpecification {
    return new ApiGatewayAndSpecification([this, other]);
  }

  or(other: IApiGatewaySpecification): IApiGatewaySpecification {
    return new ApiGatewayOrSpecification([this, other]);
  }

  not(): IApiGatewaySpecification {
    return this._spec;
  }

  getInner(): IApiGatewaySpecification {
    return this._spec;
  }
}
