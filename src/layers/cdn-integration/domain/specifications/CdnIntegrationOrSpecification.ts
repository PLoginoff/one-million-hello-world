/**
 * CdnIntegrationOrSpecification
 */

import { ICdnIntegrationSpecification } from './ICdnIntegrationSpecification';
import { CdnIntegrationAndSpecification } from './CdnIntegrationAndSpecification';
import { CdnIntegrationNotSpecification } from './CdnIntegrationNotSpecification';

export class CdnIntegrationOrSpecification implements ICdnIntegrationSpecification {
  private _specs: ICdnIntegrationSpecification[];

  constructor(specs: ICdnIntegrationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification {
    return new CdnIntegrationAndSpecification([this, other]);
  }

  or(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification {
    return new CdnIntegrationOrSpecification([...this._specs, other]);
  }

  not(): ICdnIntegrationSpecification {
    return new CdnIntegrationNotSpecification(this);
  }

  getSpecifications(): ICdnIntegrationSpecification[] {
    return [...this._specs];
  }
}
