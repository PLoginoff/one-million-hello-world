/**
 * Controller Registry Service
 * 
 * Provides controller registration and lifecycle management.
 */

import { ControllerEntity } from '../entities/ControllerEntity';
import { ControllerScopeValueObject } from '../value-objects/ControllerScopeValueObject';

export interface ControllerRegistration {
  controller: ControllerEntity;
  scope: ControllerScopeValueObject;
  instance?: any;
}

export class ControllerRegistryService {
  private registrations: Map<string, ControllerRegistration>;

  constructor() {
    this.registrations = new Map();
  }

  /**
   * Register controller
   */
  register(controller: ControllerEntity, scope: ControllerScopeValueObject): void {
    this.registrations.set(controller.data.id, {
      controller,
      scope,
    });
  }

  /**
   * Unregister controller
   */
  unregister(controllerId: string): void {
    this.registrations.delete(controllerId);
  }

  /**
   * Get registration
   */
  getRegistration(controllerId: string): ControllerRegistration | undefined {
    return this.registrations.get(controllerId);
  }

  /**
   * Get all registrations
   */
  getAllRegistrations(): ControllerRegistration[] {
    return Array.from(this.registrations.values());
  }

  /**
   * Set instance for controller
   */
  setInstance(controllerId: string, instance: any): void {
    const registration = this.registrations.get(controllerId);
    if (registration) {
      registration.instance = instance;
    }
  }

  /**
   * Get instance for controller
   */
  getInstance(controllerId: string): any | undefined {
    const registration = this.registrations.get(controllerId);
    return registration?.instance;
  }

  /**
   * Clear all registrations
   */
  clearRegistrations(): void {
    this.registrations.clear();
  }

  /**
   * Get registration count
   */
  getRegistrationCount(): number {
    return this.registrations.size;
  }
}
