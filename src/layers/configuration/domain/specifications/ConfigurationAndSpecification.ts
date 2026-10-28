/**
 * ConfigurationAndSpecification
 */

import { IConfigurationSpecification } from './IConfigurationSpecification';
import { ConfigurationOrSpecification } from './ConfigurationOrSpecification';
import { ConfigurationNotSpecification } from './ConfigurationNotSpecification';

export class ConfigurationAndSpecification implements IConfigurationSpecification {
  private _specs: IConfigurationSpecification[];

  constructor(specs: IConfigurationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IConfigurationSpecification): IConfigurationSpecification {
    return new ConfigurationAndSpecification([...this._specs, other]);
  }

  or(other: IConfigurationSpecification): IConfigurationSpecification {
    return new ConfigurationOrSpecification([this, other]);
  }

  not(): IConfigurationSpecification {
    return new ConfigurationNotSpecification(this);
  }

  getSpecifications(): IConfigurationSpecification[] {
    return [...this._specs];
  }
}
