/**
 * ISchemaRegistrySpecification interface
 */

export interface ISchemaRegistrySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification;
  or(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification;
  not(): ISchemaRegistrySpecification;
}
