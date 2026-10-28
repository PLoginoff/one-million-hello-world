/**
 * WebsocketNotSpecification
 */

import { IWebsocketSpecification } from './IWebsocketSpecification';
import { WebsocketAndSpecification } from './WebsocketAndSpecification';
import { WebsocketOrSpecification } from './WebsocketOrSpecification';

export class WebsocketNotSpecification implements IWebsocketSpecification {
  private _spec: IWebsocketSpecification;

  constructor(spec: IWebsocketSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IWebsocketSpecification): IWebsocketSpecification {
    return new WebsocketAndSpecification([this, other]);
  }

  or(other: IWebsocketSpecification): IWebsocketSpecification {
    return new WebsocketOrSpecification([this, other]);
  }

  not(): IWebsocketSpecification {
    return this._spec;
  }

  getInner(): IWebsocketSpecification {
    return this._spec;
  }
}
