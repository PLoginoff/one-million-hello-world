/**
 * Validator Registry
 * 
 * Central registry for validators with metadata.
 */

import { IValidator, ValidationResult } from '../validation/IValidator';

export interface ValidatorMetadata {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  priority?: number;
  enabled?: boolean;
  async?: boolean;
}

export class ValidatorRegistry {
  private _validators: Map<string, { validator: IValidator; metadata: ValidatorMetadata }>;
  private _categoryMap: Map<string, string[]>;
  private _tagMap: Map<string, string[]>;

  constructor() {
    this._validators = new Map();
    this._categoryMap = new Map();
    this._tagMap = new Map();
  }

  /**
   * Registers a validator with metadata
   * 
   * @param key - Unique key for the validator
   * @param validator - Validator instance
   * @param metadata - Validator metadata
   */
  register(key: string, validator: IValidator, metadata: ValidatorMetadata): void {
    this._validators.set(key, { validator, metadata });

    if (metadata.category) {
      const categoryValidators = this._categoryMap.get(metadata.category) ?? [];
      if (!categoryValidators.includes(key)) {
        categoryValidators.push(key);
      }
      this._categoryMap.set(metadata.category, categoryValidators);
    }

    if (metadata.tags) {
      for (const tag of metadata.tags) {
        const tagValidators = this._tagMap.get(tag) ?? [];
        if (!tagValidators.includes(key)) {
          tagValidators.push(key);
        }
        this._tagMap.set(tag, tagValidators);
      }
    }
  }

  /**
   * Unregisters a validator
   * 
   * @param key - Validator key
   */
  unregister(key: string): void {
    const entry = this._validators.get(key);
    if (entry) {
      if (entry.metadata.category) {
        const categoryValidators = this._categoryMap.get(entry.metadata.category) ?? [];
        const index = categoryValidators.indexOf(key);
        if (index > -1) {
          categoryValidators.splice(index, 1);
        }
      }

      if (entry.metadata.tags) {
        for (const tag of entry.metadata.tags) {
          const tagValidators = this._tagMap.get(tag) ?? [];
          const index = tagValidators.indexOf(key);
          if (index > -1) {
            tagValidators.splice(index, 1);
          }
        }
      }
    }
    this._validators.delete(key);
  }

  /**
   * Gets a validator by key
   * 
   * @param key - Validator key
   * @returns Validator or undefined
   */
  get(key: string): IValidator | undefined {
    return this._validators.get(key)?.validator;
  }

  /**
   * Gets validator metadata by key
   * 
   * @param key - Validator key
   * @returns Metadata or undefined
   */
  getMetadata(key: string): ValidatorMetadata | undefined {
    return this._validators.get(key)?.metadata;
  }

  /**
   * Gets all registered validators
   * 
   * @returns Array of validators with metadata
   */
  getAll(): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    return Array.from(this._validators.entries()).map(([key, entry]) => ({
      key,
      validator: entry.validator,
      metadata: entry.metadata,
    }));
  }

  /**
   * Gets validators by category
   * 
   * @param category - Category name
   * @returns Array of matching validators
   */
  getByCategory(category: string): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    const keys = this._categoryMap.get(category) ?? [];
    return keys.map(key => ({
      key,
      validator: this.get(key)!,
      metadata: this.getMetadata(key)!,
    }));
  }

  /**
   * Gets validators by tag
   * 
   * @param tag - Tag to filter by
   * @returns Array of matching validators
   */
  getByTag(tag: string): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    const keys = this._tagMap.get(tag) ?? [];
    return keys.map(key => ({
      key,
      validator: this.get(key)!,
      metadata: this.getMetadata(key)!,
    }));
  }

  /**
   * Gets enabled validators
   * 
   * @returns Array of enabled validators
   */
  getEnabled(): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    return this.getAll().filter(entry => entry.metadata.enabled !== false);
  }

  /**
   * Gets disabled validators
   * 
   * @returns Array of disabled validators
   */
  getDisabled(): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    return this.getAll().filter(entry => entry.metadata.enabled === false);
  }

  /**
   * Gets async validators
   * 
   * @returns Array of async validators
   */
  getAsync(): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    return this.getAll().filter(entry => entry.metadata.async === true);
  }

  /**
   * Gets validators by priority (highest first)
   * 
   * @returns Array of validators sorted by priority
   */
  getByPriority(): Array<{ key: string; validator: IValidator; metadata: ValidatorMetadata }> {
    return this.getAll().sort((a, b) => {
      const aPriority = a.metadata.priority ?? 0;
      const bPriority = b.metadata.priority ?? 0;
      return bPriority - aPriority;
    });
  }

  /**
   * Checks if a validator is registered
   * 
   * @param key - Validator key
   * @returns True if registered
   */
  has(key: string): boolean {
    return this._validators.has(key);
  }

  /**
   * Enables a validator
   * 
   * @param key - Validator key
   */
  enable(key: string): void {
    const entry = this._validators.get(key);
    if (entry) {
      entry.metadata.enabled = true;
      if (entry.validator instanceof Object && 'setEnabled' in entry.validator) {
        (entry.validator as any).setEnabled(true);
      }
    }
  }

  /**
   * Disables a validator
   * 
   * @param key - Validator key
   */
  disable(key: string): void {
    const entry = this._validators.get(key);
    if (entry) {
      entry.metadata.enabled = false;
      if (entry.validator instanceof Object && 'setEnabled' in entry.validator) {
        (entry.validator as any).setEnabled(false);
      }
    }
  }

  /**
   * Validates data using all enabled validators
   * 
   * @param data - Data to validate
   * @returns Combined validation result
   */
  validateAll(data: unknown): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const { validator, metadata } of this.getEnabled()) {
      if (metadata.enabled !== false) {
        const result = validator.validate(data);
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Gets all categories
   * 
   * @returns Array of category names
   */
  getCategories(): string[] {
    return Array.from(this._categoryMap.keys());
  }

  /**
   * Gets all tags
   * 
   * @returns Array of tag names
   */
  getTags(): string[] {
    return Array.from(this._tagMap.keys());
  }

  /**
   * Clears all registered validators
   */
  clear(): void {
    this._validators.clear();
    this._categoryMap.clear();
    this._tagMap.clear();
  }

  /**
   * Gets the number of registered validators
   * 
   * @returns Number of validators
   */
  size(): number {
    return this._validators.size;
  }
}
