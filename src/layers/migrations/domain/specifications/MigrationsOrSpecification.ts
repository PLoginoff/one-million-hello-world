/**
 * MigrationsOrSpecification
 */

import { IMigrationsSpecification } from './IMigrationsSpecification';
import { MigrationsAndSpecification } from './MigrationsAndSpecification';
import { MigrationsNotSpecification } from './MigrationsNotSpecification';

export class MigrationsOrSpecification implements IMigrationsSpecification {
  private _specs: IMigrationsSpecification[];

  constructor(specs: IMigrationsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMigrationsSpecification): IMigrationsSpecification {
    return new MigrationsAndSpecification([this, other]);
  }

  or(other: IMigrationsSpecification): IMigrationsSpecification {
    return new MigrationsOrSpecification([...this._specs, other]);
  }

  not(): IMigrationsSpecification {
    return new MigrationsNotSpecification(this);
  }

  getSpecifications(): IMigrationsSpecification[] {
    return [...this._specs];
  }
}
