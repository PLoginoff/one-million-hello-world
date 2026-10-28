/**
 * IServiceMeshSpecification interface
 */

export interface IServiceMeshSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IServiceMeshSpecification): IServiceMeshSpecification;
  or(other: IServiceMeshSpecification): IServiceMeshSpecification;
  not(): IServiceMeshSpecification;
}
