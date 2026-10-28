/**
 * IBpmnSpecification interface
 */

export interface IBpmnSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IBpmnSpecification): IBpmnSpecification;
  or(other: IBpmnSpecification): IBpmnSpecification;
  not(): IBpmnSpecification;
}
