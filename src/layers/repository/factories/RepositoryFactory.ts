/**
 * Repository Factory
 * 
 * Factory for creating repository components and configurations.
 */

import { RepositoryConfigBuilder } from '../configuration/builders/RepositoryConfigBuilder';
import { DefaultConfigs, RepositoryConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { RepositoryEntity } from '../domain/entities/RepositoryEntity';
import { RepositoryTypeValueObject } from '../domain/value-objects/RepositoryTypeValueObject';
import { RepositoryService } from '../domain/services/RepositoryService';
import { ConnectionPoolService } from '../domain/services/ConnectionPoolService';
import { RepositoryStatistics } from '../statistics/RepositoryStatistics';
import { DirectQueryStrategy } from '../strategies/strategy/DirectQueryStrategy';
import { CachedQueryStrategy } from '../strategies/strategy/CachedQueryStrategy';
import { IRepositoryStrategy } from '../strategies/strategy/IRepositoryStrategy';

export class RepositoryFactory {
  /**
   * Create default repository configuration
   */
  static createDefaultConfig(): RepositoryConfigOptions {
    return RepositoryConfigBuilder.create().build();
  }

  /**
   * Create development repository configuration
   */
  static createDevelopmentConfig(): RepositoryConfigOptions {
    return RepositoryConfigBuilder.development().build();
  }

  /**
   * Create production repository configuration
   */
  static createProductionConfig(): RepositoryConfigOptions {
    return RepositoryConfigBuilder.production().build();
  }

  /**
   * Create minimal repository configuration
   */
  static createMinimalConfig(): RepositoryConfigOptions {
    return RepositoryConfigBuilder.minimal().build();
  }

  /**
   * Create custom repository configuration
   */
  static createCustomConfig(options: Partial<RepositoryConfigOptions>): RepositoryConfigOptions {
    return RepositoryConfigBuilder.create()
      .withAutoRegistration(options.enableAutoRegistration ?? DefaultConfigs.DEFAULT.enableAutoRegistration)
      .withConnectionPool(options.enableConnectionPool ?? DefaultConfigs.DEFAULT.enableConnectionPool)
      .withMaxConnections(options.maxConnections ?? DefaultConfigs.DEFAULT.maxConnections)
      .withMaxRepositories(options.maxRepositories ?? DefaultConfigs.DEFAULT.maxRepositories)
      .withCaching(options.enableCaching ?? DefaultConfigs.DEFAULT.enableCaching)
      .build();
  }

  /**
   * Create repository service
   */
  static createRepositoryService(): RepositoryService {
    return new RepositoryService();
  }

  /**
   * Create connection pool service
   */
  static createConnectionPoolService(maxConnections?: number): ConnectionPoolService {
    return new ConnectionPoolService(maxConnections);
  }

  /**
   * Create direct query strategy
   */
  static createDirectQueryStrategy(): DirectQueryStrategy {
    return new DirectQueryStrategy();
  }

  /**
   * Create cached query strategy
   */
  static createCachedQueryStrategy(): CachedQueryStrategy {
    return new CachedQueryStrategy();
  }

  /**
   * Create repository statistics
   */
  static createRepositoryStatistics(): RepositoryStatistics {
    return new RepositoryStatistics();
  }

  /**
   * Create repository entity
   */
  static createRepository(id: string, name: string, type: string): RepositoryEntity {
    return RepositoryEntity.createBasic(id, name, type);
  }

  /**
   * Create SQL type
   */
  static createSqlType(): RepositoryTypeValueObject {
    return RepositoryTypeValueObject.sql();
  }

  /**
   * Create NoSQL type
   */
  static createNosqlType(): RepositoryTypeValueObject {
    return RepositoryTypeValueObject.nosql();
  }

  /**
   * Create file type
   */
  static createFileType(): RepositoryTypeValueObject {
    return RepositoryTypeValueObject.file();
  }

  /**
   * Create memory type
   */
  static createMemoryType(): RepositoryTypeValueObject {
    return RepositoryTypeValueObject.memory();
  }

  /**
   * Create cache type
   */
  static createCacheType(): RepositoryTypeValueObject {
    return RepositoryTypeValueObject.cache();
  }

  /**
   * Create complete repository stack with default configuration
   */
  static createDefaultStack(): {
    config: RepositoryConfigOptions;
    service: RepositoryService;
    pool: ConnectionPoolService;
    strategy: IRepositoryStrategy;
    statistics: RepositoryStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      service: this.createRepositoryService(),
      pool: this.createConnectionPoolService(),
      strategy: this.createDirectQueryStrategy(),
      statistics: this.createRepositoryStatistics(),
    };
  }

  /**
   * Create development repository stack
   */
  static createDevelopmentStack(): {
    config: RepositoryConfigOptions;
    service: RepositoryService;
    pool: ConnectionPoolService;
    strategy: IRepositoryStrategy;
    statistics: RepositoryStatistics;
  } {
    return {
      config: this.createDevelopmentConfig(),
      service: this.createRepositoryService(),
      pool: this.createConnectionPoolService(20),
      strategy: this.createDirectQueryStrategy(),
      statistics: this.createRepositoryStatistics(),
    };
  }

  /**
   * Create production repository stack
   */
  static createProductionStack(): {
    config: RepositoryConfigOptions;
    service: RepositoryService;
    pool: ConnectionPoolService;
    strategy: IRepositoryStrategy;
    statistics: RepositoryStatistics;
  } {
    return {
      config: this.createProductionConfig(),
      service: this.createRepositoryService(),
      pool: this.createConnectionPoolService(),
      strategy: this.createCachedQueryStrategy(),
      statistics: this.createRepositoryStatistics(),
    };
  }
}
