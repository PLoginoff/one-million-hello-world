/**
 * HttpParserOrSpecification
 */

import { IHttpParserSpecification } from './IHttpParserSpecification';
import { HttpParserAndSpecification } from './HttpParserAndSpecification';
import { HttpParserNotSpecification } from './HttpParserNotSpecification';

export class HttpParserOrSpecification implements IHttpParserSpecification {
  private _specs: IHttpParserSpecification[];

  constructor(specs: IHttpParserSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IHttpParserSpecification): IHttpParserSpecification {
    return new HttpParserAndSpecification([this, other]);
  }

  or(other: IHttpParserSpecification): IHttpParserSpecification {
    return new HttpParserOrSpecification([...this._specs, other]);
  }

  not(): IHttpParserSpecification {
    return new HttpParserNotSpecification(this);
  }

  getSpecifications(): IHttpParserSpecification[] {
    return [...this._specs];
  }
}
