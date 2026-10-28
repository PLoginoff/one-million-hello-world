/**
 * CdnIntegrationNotSpecification
 */

import { ICdnIntegrationSpecification } from './ICdnIntegrationSpecification';
import { CdnIntegrationAndSpecification } from './CdnIntegrationAndSpecification';
import { CdnIntegrationOrSpecification } from './CdnIntegrationOrSpecification';

export class CdnIntegrationNotSpecification implements ICdnIntegrationSpecification {
  private _spec: ICdnIntegrationSpecification;

  constructor(spec: ICdnIntegrationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification {
    return new CdnIntegrationAndSpecification([this, other]);
  }

  or(other: ICdnIntegrationSpecification): ICdnIntegrationSpecification {
    return new CdnIntegrationOrSpecification([this, other]);
  }

  not(): ICdnIntegrationSpecification {
    return this._spec;
  }

  getInner(): ICdnIntegrationSpecification {
    return this._spec;
  }
}
