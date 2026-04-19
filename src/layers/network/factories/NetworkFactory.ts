/**
 * Network Factory
 * 
 * Factory for creating network components with proper configuration.
 */

import { NetworkConfigBuilder } from '../configuration/builders/NetworkConfigBuilder';
import { NetworkConfigOptions, DefaultConfigs } from '../configuration/defaults/DefaultConfigs';
import { ExponentialBackoffStrategy } from '../strategies/reconnection/ExponentialBackoffStrategy';
import { ConnectionPoolStrategy } from '../strategies/connection/ConnectionPoolStrategy';
import { RoundRobinStrategy } from '../strategies/load-balancing/RoundRobinStrategy';
import { ConnectionId } from '../domain/entities/ConnectionId';
import { NetworkEndpoint } from '../domain/entities/NetworkEndpoint';
import { ConnectionMetadata } from '../domain/entities/ConnectionMetadata';
import { ConnectionPriority } from '../domain/value-objects/ConnectionPriority';
import { ConnectionType } from '../domain/value-objects/ConnectionType';
import { BandwidthLimit } from '../domain/value-objects/BandwidthLimit';
import { NetworkMetrics } from '../statistics/metrics/NetworkMetrics';

export class NetworkFactory {
  /**
   * Create network configuration with default settings
   */
  static createDefaultConfig(): NetworkConfigOptions {
    return NetworkConfigBuilder.create().build();
  }

  /**
   * Create high-performance configuration
   */
  static createHighPerformanceConfig(): NetworkConfigOptions {
    return NetworkConfigBuilder.highPerformance().build();
  }

  /**
   * Create secure configuration
   */
  static createSecureConfig(): NetworkConfigOptions {
    return NetworkConfigBuilder.secure().build();
  }

  /**
   * Create development configuration
   */
  static createDevelopmentConfig(): NetworkConfigOptions {
    return NetworkConfigBuilder.development().build();
  }

  /**
   * Create production configuration
   */
  static createProductionConfig(): NetworkConfigOptions {
    return NetworkConfigBuilder.production().build();
  }

  /**
   * Create custom configuration
   */
  static createCustomConfig(
    builderFn: (builder: NetworkConfigBuilder) => NetworkConfigBuilder,
  ): NetworkConfigOptions {
    return builderFn(NetworkConfigBuilder.create()).build();
  }

  /**
   * Create exponential backoff strategy
   */
  static createExponentialBackoffStrategy(
    maxRetries?: number,
    initialDelay?: number,
  ): ExponentialBackoffStrategy {
    return new ExponentialBackoffStrategy({
      maxRetries,
      initialDelay,
    });
  }

  /**
   * Create connection pool strategy
   */
  static createConnectionPoolStrategy(
    minConnections?: number,
    maxConnections?: number,
  ): ConnectionPoolStrategy {
    return new ConnectionPoolStrategy({
      minConnections,
      maxConnections,
    });
  }

  /**
   * Create round robin load balancing strategy
   */
  static createRoundRobinStrategy(endpoints: string[] = []): RoundRobinStrategy {
    return new RoundRobinStrategy(endpoints);
  }

  /**
   * Create connection ID
   */
  static createConnectionId(prefix?: string): ConnectionId {
    return prefix ? ConnectionId.withPrefix(prefix) : ConnectionId.create();
  }

  /**
   * Create network endpoint
   */
  static createEndpoint(host: string, port: number): NetworkEndpoint {
    return NetworkEndpoint.create(host, port);
  }

  /**
   * Create secure network endpoint
   */
  static createSecureEndpoint(host: string, port: number): NetworkEndpoint {
    return NetworkEndpoint.createSecure(host, port);
  }

  /**
   * Create network endpoint from address
   */
  static createEndpointFromAddress(address: string): NetworkEndpoint {
    return NetworkEndpoint.fromAddress(address);
  }

  /**
   * Create network endpoint from URL
   */
  static createEndpointFromUrl(url: string): NetworkEndpoint {
    return NetworkEndpoint.fromUrl(url);
  }

  /**
   * Create connection metadata
   */
  static createConnectionMetadata(
    connectionId: string,
    createdBy: string = 'system',
  ): ConnectionMetadata {
    return ConnectionMetadata.create(connectionId, createdBy);
  }

  /**
   * Create connection priority
   */
  static createPriority(level: 'low' | 'normal' | 'high' | 'critical'): ConnectionPriority {
    switch (level) {
      case 'low':
        return ConnectionPriority.low();
      case 'normal':
        return ConnectionPriority.normal();
      case 'high':
        return ConnectionPriority.high();
      case 'critical':
        return ConnectionPriority.critical();
    }
  }

  /**
   * Create connection type
   */
  static createConnectionType(type: 'tcp' | 'udp' | 'tls' | 'websocket'): ConnectionType {
    switch (type) {
      case 'tcp':
        return ConnectionType.tcp();
      case 'udp':
        return ConnectionType.udp();
      case 'tls':
        return ConnectionType.tls();
      case 'websocket':
        return ConnectionType.websocket();
    }
  }

  /**
   * Create bandwidth limit
   */
  static createBandwidthLimit(bytesPerSecond: number): BandwidthLimit {
    return BandwidthLimit.create(bytesPerSecond);
  }

  /**
   * Create unlimited bandwidth limit
   */
  static createUnlimitedBandwidth(): BandwidthLimit {
    return BandwidthLimit.unlimited();
  }

  /**
   * Create network metrics collector
   */
  static createMetrics(maxSamples: number = 1000): NetworkMetrics {
    return new NetworkMetrics(maxSamples);
  }

  /**
   * Create complete network stack
   */
  static createNetworkStack(config?: NetworkConfigOptions): {
    config: NetworkConfigOptions;
    reconnectionStrategy: ExponentialBackoffStrategy;
    poolStrategy: ConnectionPoolStrategy;
    loadBalancer: RoundRobinStrategy;
    metrics: NetworkMetrics;
  } {
    const finalConfig = config || DefaultConfigs.DEFAULT;

    return {
      config: finalConfig,
      reconnectionStrategy: this.createExponentialBackoffStrategy(
        finalConfig.maxRetries,
        finalConfig.retryDelay,
      ),
      poolStrategy: this.createConnectionPoolStrategy(
        1,
        finalConfig.maxConnections,
      ),
      loadBalancer: this.createRoundRobinStrategy(),
      metrics: this.createMetrics(),
    };
  }
}
