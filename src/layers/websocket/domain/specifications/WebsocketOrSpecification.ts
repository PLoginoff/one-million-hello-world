/**
 * WebsocketOrSpecification
 */

import { IWebsocketSpecification } from './IWebsocketSpecification';
import { WebsocketAndSpecification } from './WebsocketAndSpecification';
import { WebsocketNotSpecification } from './WebsocketNotSpecification';

export class WebsocketOrSpecification implements IWebsocketSpecification {
  private _specs: IWebsocketSpecification[];

  constructor(specs: IWebsocketSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWebsocketSpecification): IWebsocketSpecification {
    return new WebsocketAndSpecification([this, other]);
  }

  or(other: IWebsocketSpecification): IWebsocketSpecification {
    return new WebsocketOrSpecification([...this._specs, other]);
  }

  not(): IWebsocketSpecification {
    return new WebsocketNotSpecification(this);
  }

  getSpecifications(): IWebsocketSpecification[] {
    return [...this._specs];
  }
}
