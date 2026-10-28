/**
 * SearchNotSpecification
 */

import { ISearchSpecification } from './ISearchSpecification';
import { SearchAndSpecification } from './SearchAndSpecification';
import { SearchOrSpecification } from './SearchOrSpecification';

export class SearchNotSpecification implements ISearchSpecification {
  private _spec: ISearchSpecification;

  constructor(spec: ISearchSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISearchSpecification): ISearchSpecification {
    return new SearchAndSpecification([this, other]);
  }

  or(other: ISearchSpecification): ISearchSpecification {
    return new SearchOrSpecification([this, other]);
  }

  not(): ISearchSpecification {
    return this._spec;
  }

  getInner(): ISearchSpecification {
    return this._spec;
  }
}
