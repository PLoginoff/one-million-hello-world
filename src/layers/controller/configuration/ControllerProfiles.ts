/**
 * Controller Profiles
 *
 * Pre-defined configuration profiles for different environments.
 * Each profile provides optimized settings for its target environment.
 *
 * @module ControllerLayer/Configuration
 */

import { ControllerConfigOptions } from './defaults/DefaultConfigs';
import { ControllerConfigBuilder } from './builders/ControllerConfigBuilder';

/**
 * Supported profile names.
 */
export type ProfileName = 'development' | 'staging' | 'production' | 'test';

/**
 * Profile metadata.
 */
export interface ProfileMetadata {
  /** Profile name */
  name: ProfileName;
  /** Human-readable description */
  description: string;
  /** Whether this profile enables debug features */
  debug: boolean;
  /** Whether this profile enables metrics collection */
  metrics: boolean;
  /** Whether this profile enables health checks */
  healthChecks: boolean;
  /** Recommended log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default profile metadata.
 */
export const PROFILE_METADATA: Record<ProfileName, ProfileMetadata> = {
  development: {
    name: 'development',
    description: 'Development environment with full debugging and auto-registration',
    debug: true,
    metrics: true,
    healthChecks: true,
    logLevel: 'debug',
  },
  staging: {
    name: 'staging',
    description: 'Staging environment with production-like settings but debug enabled',
    debug: true,
    metrics: true,
    healthChecks: true,
    logLevel: 'info',
  },
  production: {
    name: 'production',
    description: 'Production environment optimized for performance and reliability',
    debug: false,
    metrics: true,
    healthChecks: true,
    logLevel: 'warn',
  },
  test: {
    name: 'test',
    description: 'Test environment with minimal overhead and fast execution',
    debug: false,
    metrics: false,
    healthChecks: false,
    logLevel: 'error',
  },
};

/**
 * Controller Profiles class providing profile-based configuration.
 */
export class ControllerProfiles {
  private static readonly _profiles: Map<ProfileName, ControllerConfigOptions> = new Map();

  static {
    // Initialize default profiles
    ControllerProfiles._profiles.set('development', ControllerProfiles._createDevelopmentProfile());
    ControllerProfiles._profiles.set('staging', ControllerProfiles._createStagingProfile());
    ControllerProfiles._profiles.set('production', ControllerProfiles._createProductionProfile());
    ControllerProfiles._profiles.set('test', ControllerProfiles._createTestProfile());
  }

  /**
   * Gets a configuration profile by name.
   *
   * @param profile - Profile name
   * @returns Configuration options for the profile
   * @throws Error if profile is not found
   */
  static getProfile(profile: ProfileName): ControllerConfigOptions {
    const config = ControllerProfiles._profiles.get(profile);
    if (!config) {
      throw new Error(
        `Unknown controller profile: ${profile}. Available: ${ControllerProfiles.getAvailableProfiles().join(', ')}`
      );
    }
    return { ...config };
  }

  /**
   * Gets metadata for a profile.
   *
   * @param profile - Profile name
   * @returns Profile metadata
   */
  static getProfileMetadata(profile: ProfileName): ProfileMetadata {
    return PROFILE_METADATA[profile];
  }

  /**
   * Gets all available profile names.
   *
   * @returns Array of available profile names
   */
  static getAvailableProfiles(): readonly ProfileName[] {
    return ['development', 'staging', 'production', 'test'] as const;
  }

  /**
   * Registers a custom profile.
   *
   * @param name - Profile name
   * @param config - Configuration options
   * @param metadata - Optional profile metadata
   */
  static registerProfile(
    name: ProfileName,
    config: ControllerConfigOptions,
    metadata?: Partial<ProfileMetadata>
  ): void {
    ControllerProfiles._profiles.set(name, { ...config });
    if (metadata) {
      PROFILE_METADATA[name] = { ...PROFILE_METADATA[name], ...metadata } as ProfileMetadata;
    }
  }

  /**
   * Creates a custom profile by extending an existing one.
   *
   * @param baseProfile - Base profile to extend
   * @param overrides - Configuration overrides
   * @param name - Name for the new profile (must be unique)
   * @returns The new profile configuration
   */
  static extendProfile(
    baseProfile: ProfileName,
    overrides: Partial<ControllerConfigOptions>,
    name: ProfileName
  ): ControllerConfigOptions {
    const baseConfig = ControllerProfiles.getProfile(baseProfile);
    const newConfig = { ...baseConfig, ...overrides };
    ControllerProfiles.registerProfile(name, newConfig);
    return newConfig;
  }

  /**
   * Creates a profile-aware configuration builder.
   *
   * @param profile - Profile name to start from
   * @returns Configuration builder pre-configured with profile settings
   */
  static createBuilderForProfile(profile: ProfileName): ControllerConfigBuilder {
    const config = ControllerProfiles.getProfile(profile);
    const builder = new ControllerConfigBuilder();
    // Apply profile config to builder
    builder
      .withAutoRegistration(config.enableAutoRegistration)
      .withDependencyInjection(config.enableDependencyInjection)
      .withDefaultScope(config.defaultScope)
      .withMaxControllers(config.maxControllers)
      .withMiddleware(config.enableMiddleware);
    return builder;
  }

  /**
   * Validates that a profile exists.
   *
   * @param profile - Profile name to validate
   * @returns True if profile exists
   */
  static isValidProfile(profile: string): profile is ProfileName {
    return ControllerProfiles.getAvailableProfiles().includes(profile as ProfileName);
  }

  /**
   * Gets the default profile for the current environment.
   * Checks NODE_ENV or defaults to 'development'.
   *
   * @returns Default profile name
   */
  static getDefaultProfile(): ProfileName {
    const env = process.env.NODE_ENV?.toLowerCase();
    if (env === 'production') return 'production';
    if (env === 'staging') return 'staging';
    if (env === 'test') return 'test';
    return 'development';
  }

  // Private profile creation methods

  private static _createDevelopmentProfile(): ControllerConfigOptions {
    return ControllerConfigBuilder.development()
      .withAutoRegistration(true)
      .withDependencyInjection(true)
      .withDefaultScope('transient')
      .withMaxControllers(200)
      .withMiddleware(true)
      .build();
  }

  private static _createStagingProfile(): ControllerConfigOptions {
    return ControllerConfigBuilder.create()
      .withAutoRegistration(false)
      .withDependencyInjection(true)
      .withDefaultScope('transient')
      .withMaxControllers(150)
      .withMiddleware(true)
      .build();
  }

  private static _createProductionProfile(): ControllerConfigOptions {
    return ControllerConfigBuilder.production()
      .withAutoRegistration(false)
      .withDependencyInjection(true)
      .withDefaultScope('singleton')
      .withMaxControllers(100)
      .withMiddleware(true)
      .build();
  }

  private static _createTestProfile(): ControllerConfigOptions {
    return ControllerConfigBuilder.minimal()
      .withAutoRegistration(false)
      .withDependencyInjection(false)
      .withDefaultScope('transient')
      .withMaxControllers(50)
      .withMiddleware(false)
      .build();
  }
}
