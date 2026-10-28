/**
 * ISecretsRotationSpecification interface
 */

export interface ISecretsRotationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISecretsRotationSpecification): ISecretsRotationSpecification;
  or(other: ISecretsRotationSpecification): ISecretsRotationSpecification;
  not(): ISecretsRotationSpecification;
}
