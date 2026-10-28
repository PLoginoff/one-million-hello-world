/**
 * IMigrationsSpecification interface
 */

export interface IMigrationsSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMigrationsSpecification): IMigrationsSpecification;
  or(other: IMigrationsSpecification): IMigrationsSpecification;
  not(): IMigrationsSpecification;
}
