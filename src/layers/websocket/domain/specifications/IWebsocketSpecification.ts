/**
 * IWebsocketSpecification interface
 */

export interface IWebsocketSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IWebsocketSpecification): IWebsocketSpecification;
  or(other: IWebsocketSpecification): IWebsocketSpecification;
  not(): IWebsocketSpecification;
}
