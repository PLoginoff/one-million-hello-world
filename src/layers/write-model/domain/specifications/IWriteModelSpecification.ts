/**
 * IWriteModelSpecification interface
 */

export interface IWriteModelSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IWriteModelSpecification): IWriteModelSpecification;
  or(other: IWriteModelSpecification): IWriteModelSpecification;
  not(): IWriteModelSpecification;
}
