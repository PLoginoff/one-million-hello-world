/**
 * Service Discovery Service
 * 
 * Provides service discovery and health checking.
 */

import { ServiceEntity } from '../entities/ServiceEntity';
import { ServiceStatusValueObject } from '../value-objects/ServiceStatusValueObject';

export interface ServiceRegistration {
  service: ServiceEntity;
  status: ServiceStatusValueObject;
  lastHeartbeat: number;
}

export class ServiceDiscoveryService {
  private registrations: Map<string, ServiceRegistration>;

  constructor() {
    this.registrations = new Map();
  }

  /**
   * Register service
   */
  register(service: ServiceEntity, status: ServiceStatusValueObject): void {
    this.registrations.set(service.data.id, {
      service,
      status,
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Unregister service
   */
  unregister(serviceId: string): void {
    this.registrations.delete(serviceId);
  }

  /**
   * Get registration
   */
  getRegistration(serviceId: string): ServiceRegistration | undefined {
    return this.registrations.get(serviceId);
  }

  /**
   * Get all registrations
   */
  getAllRegistrations(): ServiceRegistration[] {
    return Array.from(this.registrations.values());
  }

  /**
   * Update service status
   */
  updateStatus(serviceId: string, status: ServiceStatusValueObject): void {
    const registration = this.registrations.get(serviceId);
    if (registration) {
      registration.status = status;
      registration.lastHeartbeat = Date.now();
    }
  }

  /**
   * Update heartbeat
   */
  updateHeartbeat(serviceId: string): void {
    const registration = this.registrations.get(serviceId);
    if (registration) {
      registration.lastHeartbeat = Date.now();
    }
  }

  /**
   * Get healthy services
   */
  getHealthyServices(): ServiceRegistration[] {
    return Array.from(this.registrations.values()).filter(
      r => r.status.isHealthy()
    );
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
