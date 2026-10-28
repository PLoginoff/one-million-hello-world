/**
 * ISiemSpecification interface
 */

export interface ISiemSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISiemSpecification): ISiemSpecification;
  or(other: ISiemSpecification): ISiemSpecification;
  not(): ISiemSpecification;
}
