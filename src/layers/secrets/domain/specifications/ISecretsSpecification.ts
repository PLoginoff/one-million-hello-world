/**
 * ISecretsSpecification interface
 */

export interface ISecretsSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISecretsSpecification): ISecretsSpecification;
  or(other: ISecretsSpecification): ISecretsSpecification;
  not(): ISecretsSpecification;
}
