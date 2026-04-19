/**
 * Service Service
 * 
 * Provides service management logic.
 */

import { ServiceEntity } from '../entities/ServiceEntity';

export class ServiceService {
  private services: Map<string, ServiceEntity>;

  constructor() {
    this.services = new Map();
  }

  /**
   * Add service
   */
  addService(service: ServiceEntity): void {
    this.services.set(service.data.id, service);
  }

  /**
   * Remove service
   */
  removeService(serviceId: string): void {
    this.services.delete(serviceId);
  }

  /**
   * Get service
   */
  getService(serviceId: string): ServiceEntity | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get all services
   */
  getAllServices(): ServiceEntity[] {
    return Array.from(this.services.values());
  }

  /**
   * Get enabled services
   */
  getEnabledServices(): ServiceEntity[] {
    return Array.from(this.services.values()).filter(s => s.isEnabled());
  }

  /**
   * Find service by name
   */
  findByName(name: string): ServiceEntity | undefined {
    return Array.from(this.services.values()).find(
      s => s.data.name === name
    );
  }

  /**
   * Clear all services
   */
  clearServices(): void {
    this.services.clear();
  }

  /**
   * Get service count
   */
  getServiceCount(): number {
    return this.services.size;
  }
}
