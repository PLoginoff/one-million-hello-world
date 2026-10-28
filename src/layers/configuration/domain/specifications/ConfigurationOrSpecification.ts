/**
 * ConfigurationOrSpecification
 */

import { IConfigurationSpecification } from './IConfigurationSpecification';
import { ConfigurationAndSpecification } from './ConfigurationAndSpecification';
import { ConfigurationNotSpecification } from './ConfigurationNotSpecification';

export class ConfigurationOrSpecification implements IConfigurationSpecification {
  private _specs: IConfigurationSpecification[];

  constructor(specs: IConfigurationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IConfigurationSpecification): IConfigurationSpecification {
    return new ConfigurationAndSpecification([this, other]);
  }

  or(other: IConfigurationSpecification): IConfigurationSpecification {
    return new ConfigurationOrSpecification([...this._specs, other]);
  }

  not(): IConfigurationSpecification {
    return new ConfigurationNotSpecification(this);
  }

  getSpecifications(): IConfigurationSpecification[] {
    return [...this._specs];
  }
}
