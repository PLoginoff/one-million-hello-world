/**
 * BotDetectionAndSpecification
 */

import { IBotDetectionSpecification } from './IBotDetectionSpecification';
import { BotDetectionOrSpecification } from './BotDetectionOrSpecification';
import { BotDetectionNotSpecification } from './BotDetectionNotSpecification';

export class BotDetectionAndSpecification implements IBotDetectionSpecification {
  private _specs: IBotDetectionSpecification[];

  constructor(specs: IBotDetectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBotDetectionSpecification): IBotDetectionSpecification {
    return new BotDetectionAndSpecification([...this._specs, other]);
  }

  or(other: IBotDetectionSpecification): IBotDetectionSpecification {
    return new BotDetectionOrSpecification([this, other]);
  }

  not(): IBotDetectionSpecification {
    return new BotDetectionNotSpecification(this);
  }

  getSpecifications(): IBotDetectionSpecification[] {
    return [...this._specs];
  }
}
