/**
 * MigrationsNotSpecification
 */

import { IMigrationsSpecification } from './IMigrationsSpecification';
import { MigrationsAndSpecification } from './MigrationsAndSpecification';
import { MigrationsOrSpecification } from './MigrationsOrSpecification';

export class MigrationsNotSpecification implements IMigrationsSpecification {
  private _spec: IMigrationsSpecification;

  constructor(spec: IMigrationsSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMigrationsSpecification): IMigrationsSpecification {
    return new MigrationsAndSpecification([this, other]);
  }

  or(other: IMigrationsSpecification): IMigrationsSpecification {
    return new MigrationsOrSpecification([this, other]);
  }

  not(): IMigrationsSpecification {
    return this._spec;
  }

  getInner(): IMigrationsSpecification {
    return this._spec;
  }
}
