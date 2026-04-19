/**
 * Versioning Manager Unit Tests
 */

import { VersioningManager } from '../../versioning/VersioningManager';
import { WrapperVersioningStrategy } from '../../versioning/WrapperVersioningStrategy';
import { HeaderVersioningStrategy } from '../../versioning/HeaderVersioningStrategy';

describe('VersioningManager', () => {
  describe('with WrapperVersioningStrategy', () => {
    let manager: VersioningManager;

    beforeEach(() => {
      manager = new VersioningManager(new WrapperVersioningStrategy(), '1.0');
    });

    describe('applyVersioning', () => {
      it('should apply versioning when enabled', () => {
        manager.setEnabled(true);
        const data = '{"message":"Hello"}';
        const result = manager.applyVersioning(data);

        expect(result).toContain('version');
        expect(result).toContain('1.0');
      });

      it('should not apply versioning when disabled', () => {
        manager.setEnabled(false);
        const data = '{"message":"Hello"}';
        const result = manager.applyVersioning(data);

        expect(result).toBe(data);
      });

      it('should include metadata', () => {
        manager.setEnabled(true);
        const data = '{"message":"Hello"}';
        const result = manager.applyVersioning(data);

        const parsed = JSON.parse(result);
        expect(parsed._meta).toBeDefined();
        expect(parsed._meta.versioningStrategy).toBe('wrapper');
      });
    });

    describe('extractVersion', () => {
      it('should extract version when enabled', () => {
        manager.setEnabled(true);
        const data = '{"message":"Hello"}';
        const versioned = manager.applyVersioning(data);
        const result = manager.extractVersion(versioned);

        expect(result).not.toBeNull();
        expect(result?.version).toBe('1.0');
        expect(result?.data).toBe(data);
      });

      it('should return null when disabled', () => {
        manager.setEnabled(false);
        const data = '{"message":"Hello"}';
        const result = manager.extractVersion(data);

        expect(result).toBeNull();
      });

      it('should return null for non-versioned data', () => {
        manager.setEnabled(true);
        const data = '{"message":"Hello"}';
        const result = manager.extractVersion(data);

        expect(result).toBeNull();
      });
    });

    describe('isVersioned', () => {
      it('should return true for versioned data', () => {
        manager.setEnabled(true);
        const data = '{"message":"Hello"}';
        const versioned = manager.applyVersioning(data);

        expect(manager.isVersioned(versioned)).toBe(true);
      });

      it('should return false for non-versioned data', () => {
        manager.setEnabled(true);
        const data = '{"message":"Hello"}';

        expect(manager.isVersioned(data)).toBe(false);
      });

      it('should return false when disabled', () => {
        manager.setEnabled(false);
        const data = '{"message":"Hello"}';

        expect(manager.isVersioned(data)).toBe(false);
      });
    });

    describe('setStrategy', () => {
      it('should change strategy', () => {
        const newStrategy = new HeaderVersioningStrategy();
        manager.setStrategy(newStrategy);

        const data = '{"message":"Hello"}';
        const result = manager.applyVersioning(data);

        expect(result).toContain('X-API-Version:');
      });
    });

    describe('setCurrentVersion', () => {
      it('should change current version', () => {
        manager.setCurrentVersion('2.0');
        manager.setEnabled(true);

        const data = '{"message":"Hello"}';
        const versioned = manager.applyVersioning(data);
        const result = manager.extractVersion(versioned);

        expect(result?.version).toBe('2.0');
      });
    });
  });

  describe('with HeaderVersioningStrategy', () => {
    let manager: VersioningManager;

    beforeEach(() => {
      manager = new VersioningManager(new HeaderVersioningStrategy(), '1.0');
      manager.setEnabled(true);
    });

    describe('applyVersioning', () => {
      it('should add version header', () => {
        const data = '{"message":"Hello"}';
        const result = manager.applyVersioning(data);

        expect(result).toContain('X-API-Version: 1.0');
        expect(result.startsWith('X-API-Version:')).toBe(true);
      });
    });

    describe('extractVersion', () => {
      it('should extract version from header', () => {
        const data = '{"message":"Hello"}';
        const versioned = manager.applyVersioning(data);
        const result = manager.extractVersion(versioned);

        expect(result).not.toBeNull();
        expect(result?.version).toBe('1.0');
        expect(result?.data).toBe(data);
      });
    });
  });
});
