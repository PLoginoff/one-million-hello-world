/**
 * BotDetectionNotSpecification
 */

import { IBotDetectionSpecification } from './IBotDetectionSpecification';
import { BotDetectionAndSpecification } from './BotDetectionAndSpecification';
import { BotDetectionOrSpecification } from './BotDetectionOrSpecification';

export class BotDetectionNotSpecification implements IBotDetectionSpecification {
  private _spec: IBotDetectionSpecification;

  constructor(spec: IBotDetectionSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IBotDetectionSpecification): IBotDetectionSpecification {
    return new BotDetectionAndSpecification([this, other]);
  }

  or(other: IBotDetectionSpecification): IBotDetectionSpecification {
    return new BotDetectionOrSpecification([this, other]);
  }

  not(): IBotDetectionSpecification {
    return this._spec;
  }

  getInner(): IBotDetectionSpecification {
    return this._spec;
  }
}
