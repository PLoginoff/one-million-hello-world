/**
 * SiemAndSpecification
 */

import { ISiemSpecification } from './ISiemSpecification';
import { SiemOrSpecification } from './SiemOrSpecification';
import { SiemNotSpecification } from './SiemNotSpecification';

export class SiemAndSpecification implements ISiemSpecification {
  private _specs: ISiemSpecification[];

  constructor(specs: ISiemSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISiemSpecification): ISiemSpecification {
    return new SiemAndSpecification([...this._specs, other]);
  }

  or(other: ISiemSpecification): ISiemSpecification {
    return new SiemOrSpecification([this, other]);
  }

  not(): ISiemSpecification {
    return new SiemNotSpecification(this);
  }

  getSpecifications(): ISiemSpecification[] {
    return [...this._specs];
  }
}
