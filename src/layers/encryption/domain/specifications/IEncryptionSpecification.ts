/**
 * IEncryptionSpecification interface
 */

export interface IEncryptionSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IEncryptionSpecification): IEncryptionSpecification;
  or(other: IEncryptionSpecification): IEncryptionSpecification;
  not(): IEncryptionSpecification;
}
