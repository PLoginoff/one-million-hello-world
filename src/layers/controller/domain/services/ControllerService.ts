/**
 * Controller Service
 * 
 * Provides controller management logic.
 */

import { ControllerEntity } from '../entities/ControllerEntity';

export class ControllerService {
  private controllers: Map<string, ControllerEntity>;

  constructor() {
    this.controllers = new Map();
  }

  /**
   * Add controller
   */
  addController(controller: ControllerEntity): void {
    this.controllers.set(controller.data.id, controller);
  }

  /**
   * Remove controller
   */
  removeController(controllerId: string): void {
    this.controllers.delete(controllerId);
  }

  /**
   * Get controller
   */
  getController(controllerId: string): ControllerEntity | undefined {
    return this.controllers.get(controllerId);
  }

  /**
   * Get all controllers
   */
  getAllControllers(): ControllerEntity[] {
    return Array.from(this.controllers.values());
  }

  /**
   * Get enabled controllers
   */
  getEnabledControllers(): ControllerEntity[] {
    return Array.from(this.controllers.values()).filter(c => c.isEnabled());
  }

  /**
   * Find controller by base path
   */
  findByBasePath(basePath: string): ControllerEntity | undefined {
    return Array.from(this.controllers.values()).find(
      c => c.data.basePath === basePath
    );
  }

  /**
   * Clear all controllers
   */
  clearControllers(): void {
    this.controllers.clear();
  }

  /**
   * Get controller count
   */
  getControllerCount(): number {
    return this.controllers.size;
  }
}
