/**
 * ServiceMesh Interface
 *
 * Defines the contract for the Service mesh abstraction and sidecar pattern layer.
 */

import { ServiceMeshResult, ServiceMeshContext } from '../types/service-mesh-types';

export interface IServiceMesh {
  /**
   * Execute the serviceMesh operation
   */
  execute(context: ServiceMeshContext): Promise<ServiceMeshResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
