/**
 * IOauth2Specification interface
 */

export interface IOauth2Specification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IOauth2Specification): IOauth2Specification;
  or(other: IOauth2Specification): IOauth2Specification;
  not(): IOauth2Specification;
}
