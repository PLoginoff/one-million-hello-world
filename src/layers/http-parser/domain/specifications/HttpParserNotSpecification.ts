/**
 * HttpParserNotSpecification
 */

import { IHttpParserSpecification } from './IHttpParserSpecification';
import { HttpParserAndSpecification } from './HttpParserAndSpecification';
import { HttpParserOrSpecification } from './HttpParserOrSpecification';

export class HttpParserNotSpecification implements IHttpParserSpecification {
  private _spec: IHttpParserSpecification;

  constructor(spec: IHttpParserSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IHttpParserSpecification): IHttpParserSpecification {
    return new HttpParserAndSpecification([this, other]);
  }

  or(other: IHttpParserSpecification): IHttpParserSpecification {
    return new HttpParserOrSpecification([this, other]);
  }

  not(): IHttpParserSpecification {
    return this._spec;
  }

  getInner(): IHttpParserSpecification {
    return this._spec;
  }
}
