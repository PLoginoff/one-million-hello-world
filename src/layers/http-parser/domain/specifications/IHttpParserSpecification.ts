/**
 * IHttpParserSpecification interface
 */

export interface IHttpParserSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IHttpParserSpecification): IHttpParserSpecification;
  or(other: IHttpParserSpecification): IHttpParserSpecification;
  not(): IHttpParserSpecification;
}
