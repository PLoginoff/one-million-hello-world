/**
 * Network Endpoint Entity
 * 
 * Represents a network endpoint with host and port.
 * Provides validation and formatting capabilities.
 */

export class NetworkEndpoint {
  readonly host: string;
  readonly port: number;
  readonly protocol: string;
  readonly secure: boolean;

  private constructor(host: string, port: number, protocol: string, secure: boolean) {
    if (!host || host.length === 0) {
      throw new Error('Host cannot be empty');
    }
    if (port < 0 || port > 65535) {
      throw new Error('Port must be between 0 and 65535');
    }
    this.host = host;
    this.port = port;
    this.protocol = protocol;
    this.secure = secure;
  }

  /**
   * Create a new network endpoint
   */
  static create(host: string, port: number): NetworkEndpoint {
    return new NetworkEndpoint(host, port, 'tcp', false);
  }

  /**
   * Create a secure (TLS) endpoint
   */
  static createSecure(host: string, port: number): NetworkEndpoint {
    return new NetworkEndpoint(host, port, 'tls', true);
  }

  /**
   * Create from address string (e.g., "localhost:3000")
   */
  static fromAddress(address: string): NetworkEndpoint {
    const [host, portStr] = address.split(':');
    const port = portStr ? parseInt(portStr, 10) : 80;
    return new NetworkEndpoint(host || 'localhost', port, 'tcp', false);
  }

  /**
   * Create from URL string
   */
  static fromUrl(url: string): NetworkEndpoint {
    const protocolMatch = url.match(/^([a-z]+):\/\//i);
    const protocol = protocolMatch?.[1]?.toLowerCase() || 'http';
    const withoutProtocol = url.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '');
    const hostParts = withoutProtocol.split('/');
    const hostPort = hostParts[0] || 'localhost';
    const [host, portStr] = hostPort.split(':');
    const port = portStr ? parseInt(portStr, 10) : (protocol === 'https' || protocol === 'wss' ? 443 : 80);
    const secure = protocol === 'https' || protocol === 'wss';
    return new NetworkEndpoint(host || 'localhost', port, protocol, secure);
  }

  /**
   * Check if this endpoint equals another endpoint
   */
  equals(other: NetworkEndpoint): boolean {
    return this.host === other.host && this.port === other.port && this.protocol === other.protocol;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return `${this.host}:${this.port}`;
  }

  /**
   * Get full address with protocol
   */
  getFullAddress(): string {
    return `${this.protocol}://${this.host}:${this.port}`;
  }

  /**
   * Check if endpoint is localhost
   */
  isLocalhost(): boolean {
    return this.host === 'localhost' || this.host === '127.0.0.1' || this.host === '::1';
  }

  /**
   * Check if endpoint is secure
   */
  isSecure(): boolean {
    return this.secure;
  }

  /**
   * Get hostname without port
   */
  getHostname(): string {
    return this.host;
  }

  /**
   * Get port number
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get protocol
   */
  getProtocol(): string {
    return this.protocol;
  }

  /**
   * Validate endpoint
   */
  isValid(): boolean {
    return this.host.length > 0 && this.port >= 0 && this.port <= 65535;
  }

  /**
   * Create a copy with different port
   */
  withPort(port: number): NetworkEndpoint {
    return new NetworkEndpoint(this.host, port, this.protocol, this.secure);
  }

  /**
   * Create a copy with different host
   */
  withHost(host: string): NetworkEndpoint {
    return new NetworkEndpoint(host, this.port, this.protocol, this.secure);
  }
}
