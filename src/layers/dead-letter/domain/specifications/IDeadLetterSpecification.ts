/**
 * IDeadLetterSpecification interface
 */

export interface IDeadLetterSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDeadLetterSpecification): IDeadLetterSpecification;
  or(other: IDeadLetterSpecification): IDeadLetterSpecification;
  not(): IDeadLetterSpecification;
}
