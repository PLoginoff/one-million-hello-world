/**
 * ConfigurationNotSpecification
 */

import { IConfigurationSpecification } from './IConfigurationSpecification';
import { ConfigurationAndSpecification } from './ConfigurationAndSpecification';
import { ConfigurationOrSpecification } from './ConfigurationOrSpecification';

export class ConfigurationNotSpecification implements IConfigurationSpecification {
  private _spec: IConfigurationSpecification;

  constructor(spec: IConfigurationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IConfigurationSpecification): IConfigurationSpecification {
    return new ConfigurationAndSpecification([this, other]);
  }

  or(other: IConfigurationSpecification): IConfigurationSpecification {
    return new ConfigurationOrSpecification([this, other]);
  }

  not(): IConfigurationSpecification {
    return this._spec;
  }

  getInner(): IConfigurationSpecification {
    return this._spec;
  }
}
