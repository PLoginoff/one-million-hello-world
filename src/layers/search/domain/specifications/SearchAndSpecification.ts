/**
 * SearchAndSpecification
 */

import { ISearchSpecification } from './ISearchSpecification';
import { SearchOrSpecification } from './SearchOrSpecification';
import { SearchNotSpecification } from './SearchNotSpecification';

export class SearchAndSpecification implements ISearchSpecification {
  private _specs: ISearchSpecification[];

  constructor(specs: ISearchSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISearchSpecification): ISearchSpecification {
    return new SearchAndSpecification([...this._specs, other]);
  }

  or(other: ISearchSpecification): ISearchSpecification {
    return new SearchOrSpecification([this, other]);
  }

  not(): ISearchSpecification {
    return new SearchNotSpecification(this);
  }

  getSpecifications(): ISearchSpecification[] {
    return [...this._specs];
  }
}
