/**
 * Round Robin Load Balancing Strategy
 * 
 * Distributes connections across endpoints using round-robin algorithm.
 */

export class RoundRobinStrategy {
  private endpoints: string[];
  private currentIndex: number;

  constructor(endpoints: string[] = []) {
    this.endpoints = [...endpoints];
    this.currentIndex = 0;
  }

  /**
   * Get next endpoint
   */
  getNext(): string | null {
    if (this.endpoints.length === 0) {
      return null;
    }

    const endpoint = this.endpoints[this.currentIndex] ?? null;
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    return endpoint;
  }

  /**
   * Add endpoint
   */
  addEndpoint(endpoint: string): void {
    if (!this.endpoints.includes(endpoint)) {
      this.endpoints.push(endpoint);
    }
  }

  /**
   * Remove endpoint
   */
  removeEndpoint(endpoint: string): boolean {
    const index = this.endpoints.indexOf(endpoint);
    if (index !== -1) {
      this.endpoints.splice(index, 1);
      if (this.currentIndex >= this.endpoints.length) {
        this.currentIndex = 0;
      }
      return true;
    }
    return false;
  }

  /**
   * Get all endpoints
   */
  getEndpoints(): string[] {
    return [...this.endpoints];
  }

  /**
   * Get endpoint count
   */
  getCount(): number {
    return this.endpoints.length;
  }

  /**
   * Check if has endpoints
   */
  hasEndpoints(): boolean {
    return this.endpoints.length > 0;
  }

  /**
   * Reset index
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * Set endpoints
   */
  setEndpoints(endpoints: string[]): void {
    this.endpoints = [...endpoints];
    this.currentIndex = 0;
  }
}
