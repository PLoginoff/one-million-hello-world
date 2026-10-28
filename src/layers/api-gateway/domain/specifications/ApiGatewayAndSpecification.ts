/**
 * ApiGatewayAndSpecification
 */

import { IApiGatewaySpecification } from './IApiGatewaySpecification';
import { ApiGatewayOrSpecification } from './ApiGatewayOrSpecification';
import { ApiGatewayNotSpecification } from './ApiGatewayNotSpecification';

export class ApiGatewayAndSpecification implements IApiGatewaySpecification {
  private _specs: IApiGatewaySpecification[];

  constructor(specs: IApiGatewaySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IApiGatewaySpecification): IApiGatewaySpecification {
    return new ApiGatewayAndSpecification([...this._specs, other]);
  }

  or(other: IApiGatewaySpecification): IApiGatewaySpecification {
    return new ApiGatewayOrSpecification([this, other]);
  }

  not(): IApiGatewaySpecification {
    return new ApiGatewayNotSpecification(this);
  }

  getSpecifications(): IApiGatewaySpecification[] {
    return [...this._specs];
  }
}
