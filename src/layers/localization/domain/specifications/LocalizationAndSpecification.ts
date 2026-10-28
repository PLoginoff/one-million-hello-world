/**
 * LocalizationAndSpecification
 */

import { ILocalizationSpecification } from './ILocalizationSpecification';
import { LocalizationOrSpecification } from './LocalizationOrSpecification';
import { LocalizationNotSpecification } from './LocalizationNotSpecification';

export class LocalizationAndSpecification implements ILocalizationSpecification {
  private _specs: ILocalizationSpecification[];

  constructor(specs: ILocalizationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ILocalizationSpecification): ILocalizationSpecification {
    return new LocalizationAndSpecification([...this._specs, other]);
  }

  or(other: ILocalizationSpecification): ILocalizationSpecification {
    return new LocalizationOrSpecification([this, other]);
  }

  not(): ILocalizationSpecification {
    return new LocalizationNotSpecification(this);
  }

  getSpecifications(): ILocalizationSpecification[] {
    return [...this._specs];
  }
}
