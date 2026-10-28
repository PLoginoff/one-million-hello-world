/**
 * WebsocketAndSpecification
 */

import { IWebsocketSpecification } from './IWebsocketSpecification';
import { WebsocketOrSpecification } from './WebsocketOrSpecification';
import { WebsocketNotSpecification } from './WebsocketNotSpecification';

export class WebsocketAndSpecification implements IWebsocketSpecification {
  private _specs: IWebsocketSpecification[];

  constructor(specs: IWebsocketSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWebsocketSpecification): IWebsocketSpecification {
    return new WebsocketAndSpecification([...this._specs, other]);
  }

  or(other: IWebsocketSpecification): IWebsocketSpecification {
    return new WebsocketOrSpecification([this, other]);
  }

  not(): IWebsocketSpecification {
    return new WebsocketNotSpecification(this);
  }

  getSpecifications(): IWebsocketSpecification[] {
    return [...this._specs];
  }
}
