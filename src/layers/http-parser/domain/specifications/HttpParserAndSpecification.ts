/**
 * HttpParserAndSpecification
 */

import { IHttpParserSpecification } from './IHttpParserSpecification';
import { HttpParserOrSpecification } from './HttpParserOrSpecification';
import { HttpParserNotSpecification } from './HttpParserNotSpecification';

export class HttpParserAndSpecification implements IHttpParserSpecification {
  private _specs: IHttpParserSpecification[];

  constructor(specs: IHttpParserSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IHttpParserSpecification): IHttpParserSpecification {
    return new HttpParserAndSpecification([...this._specs, other]);
  }

  or(other: IHttpParserSpecification): IHttpParserSpecification {
    return new HttpParserOrSpecification([this, other]);
  }

  not(): IHttpParserSpecification {
    return new HttpParserNotSpecification(this);
  }

  getSpecifications(): IHttpParserSpecification[] {
    return [...this._specs];
  }
}
