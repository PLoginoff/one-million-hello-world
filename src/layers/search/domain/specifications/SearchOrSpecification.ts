/**
 * SearchOrSpecification
 */

import { ISearchSpecification } from './ISearchSpecification';
import { SearchAndSpecification } from './SearchAndSpecification';
import { SearchNotSpecification } from './SearchNotSpecification';

export class SearchOrSpecification implements ISearchSpecification {
  private _specs: ISearchSpecification[];

  constructor(specs: ISearchSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISearchSpecification): ISearchSpecification {
    return new SearchAndSpecification([this, other]);
  }

  or(other: ISearchSpecification): ISearchSpecification {
    return new SearchOrSpecification([...this._specs, other]);
  }

  not(): ISearchSpecification {
    return new SearchNotSpecification(this);
  }

  getSpecifications(): ISearchSpecification[] {
    return [...this._specs];
  }
}
