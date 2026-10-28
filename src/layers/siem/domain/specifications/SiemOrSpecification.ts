/**
 * SiemOrSpecification
 */

import { ISiemSpecification } from './ISiemSpecification';
import { SiemAndSpecification } from './SiemAndSpecification';
import { SiemNotSpecification } from './SiemNotSpecification';

export class SiemOrSpecification implements ISiemSpecification {
  private _specs: ISiemSpecification[];

  constructor(specs: ISiemSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISiemSpecification): ISiemSpecification {
    return new SiemAndSpecification([this, other]);
  }

  or(other: ISiemSpecification): ISiemSpecification {
    return new SiemOrSpecification([...this._specs, other]);
  }

  not(): ISiemSpecification {
    return new SiemNotSpecification(this);
  }

  getSpecifications(): ISiemSpecification[] {
    return [...this._specs];
  }
}
