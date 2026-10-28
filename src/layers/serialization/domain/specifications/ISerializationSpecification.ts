/**
 * ISerializationSpecification interface
 */

export interface ISerializationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISerializationSpecification): ISerializationSpecification;
  or(other: ISerializationSpecification): ISerializationSpecification;
  not(): ISerializationSpecification;
}
