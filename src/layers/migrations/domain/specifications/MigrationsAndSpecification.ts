/**
 * MigrationsAndSpecification
 */

import { IMigrationsSpecification } from './IMigrationsSpecification';
import { MigrationsOrSpecification } from './MigrationsOrSpecification';
import { MigrationsNotSpecification } from './MigrationsNotSpecification';

export class MigrationsAndSpecification implements IMigrationsSpecification {
  private _specs: IMigrationsSpecification[];

  constructor(specs: IMigrationsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMigrationsSpecification): IMigrationsSpecification {
    return new MigrationsAndSpecification([...this._specs, other]);
  }

  or(other: IMigrationsSpecification): IMigrationsSpecification {
    return new MigrationsOrSpecification([this, other]);
  }

  not(): IMigrationsSpecification {
    return new MigrationsNotSpecification(this);
  }

  getSpecifications(): IMigrationsSpecification[] {
    return [...this._specs];
  }
}
