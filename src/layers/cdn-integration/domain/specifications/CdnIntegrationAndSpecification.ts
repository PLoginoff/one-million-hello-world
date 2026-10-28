/**
 * CdnIntegrationAndSpecification
 */

import { ICdnIntegrationSpecification } from './ICdnIntegrationSpecification';
import { CdnIntegrationOrSpecification } from './CdnIntegrationOrSpecification';
import { CdnIntegrationNotSpecification } from './CdnIntegrationNotSpecification';

export class CdnIntegrationAndSpecification implements ICdnIntegrationSpecification {
  private _specs: ICdnIntegrationSpecification[];

  constructor(specs: ICdnIntegrationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification {
    return new CdnIntegrationAndSpecification([...this._specs, other]);
  }

  or(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification {
    return new CdnIntegrationOrSpecification([this, other]);
  }

  not(): ICdnIntegrationSpecification {
    return new CdnIntegrationNotSpecification(this);
  }

  getSpecifications(): ICdnIntegrationSpecification[] {
    return [...this._specs];
  }
}
