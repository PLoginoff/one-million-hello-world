/**
 * BotDetectionOrSpecification
 */

import { IBotDetectionSpecification } from './IBotDetectionSpecification';
import { BotDetectionAndSpecification } from './BotDetectionAndSpecification';
import { BotDetectionNotSpecification } from './BotDetectionNotSpecification';

export class BotDetectionOrSpecification implements IBotDetectionSpecification {
  private _specs: IBotDetectionSpecification[];

  constructor(specs: IBotDetectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBotDetectionSpecification): IBotDetectionSpecification {
    return new BotDetectionAndSpecification([this, other]);
  }

  or(other: IBotDetectionSpecification): IBotDetectionSpecification {
    return new BotDetectionOrSpecification([...this._specs, other]);
  }

  not(): IBotDetectionSpecification {
    return new BotDetectionNotSpecification(this);
  }

  getSpecifications(): IBotDetectionSpecification[] {
    return [...this._specs];
  }
}
