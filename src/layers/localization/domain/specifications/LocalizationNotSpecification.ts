/**
 * LocalizationNotSpecification
 */

import { ILocalizationSpecification } from './ILocalizationSpecification';
import { LocalizationAndSpecification } from './LocalizationAndSpecification';
import { LocalizationOrSpecification } from './LocalizationOrSpecification';

export class LocalizationNotSpecification implements ILocalizationSpecification {
  private _spec: ILocalizationSpecification;

  constructor(spec: ILocalizationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ILocalizationSpecification): ILocalizationSpecification {
    return new LocalizationAndSpecification([this, other]);
  }

  or(other: ILocalizationSpecification): ILocalizationSpecification {
    return new LocalizationOrSpecification([this, other]);
  }

  not(): ILocalizationSpecification {
    return this._spec;
  }

  getInner(): ILocalizationSpecification {
    return this._spec;
  }
}
