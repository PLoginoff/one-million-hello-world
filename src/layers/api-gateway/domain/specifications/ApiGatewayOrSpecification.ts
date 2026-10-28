/**
 * ApiGatewayOrSpecification
 */

import { IApiGatewaySpecification } from './IApiGatewaySpecification';
import { ApiGatewayAndSpecification } from './ApiGatewayAndSpecification';
import { ApiGatewayNotSpecification } from './ApiGatewayNotSpecification';

export class ApiGatewayOrSpecification implements IApiGatewaySpecification {
  private _specs: IApiGatewaySpecification[];

  constructor(specs: IApiGatewaySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IApiGatewaySpecification): IApiGatewaySpecification {
    return new ApiGatewayAndSpecification([this, other]);
  }

  or(other: IApiGatewaySpecification): IApiGatewaySpecification {
    return new ApiGatewayOrSpecification([...this._specs, other]);
  }

  not(): IApiGatewaySpecification {
    return new ApiGatewayNotSpecification(this);
  }

  getSpecifications(): IApiGatewaySpecification[] {
    return [...this._specs];
  }
}
