/**
 * LocalizationOrSpecification
 */

import { ILocalizationSpecification } from './ILocalizationSpecification';
import { LocalizationAndSpecification } from './LocalizationAndSpecification';
import { LocalizationNotSpecification } from './LocalizationNotSpecification';

export class LocalizationOrSpecification implements ILocalizationSpecification {
  private _specs: ILocalizationSpecification[];

  constructor(specs: ILocalizationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ILocalizationSpecification): ILocalizationSpecification {
    return new LocalizationAndSpecification([this, other]);
  }

  or(other: ILocalizationSpecification): ILocalizationSpecification {
    return new LocalizationOrSpecification([...this._specs, other]);
  }

  not(): ILocalizationSpecification {
    return new LocalizationNotSpecification(this);
  }

  getSpecifications(): ILocalizationSpecification[] {
    return [...this._specs];
  }
}
