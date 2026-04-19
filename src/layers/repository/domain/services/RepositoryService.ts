/**
 * Repository Service
 * 
 * Provides repository management logic.
 */

import { RepositoryEntity } from '../entities/RepositoryEntity';

export class RepositoryService {
  private repositories: Map<string, RepositoryEntity>;

  constructor() {
    this.repositories = new Map();
  }

  /**
   * Add repository
   */
  addRepository(repository: RepositoryEntity): void {
    this.repositories.set(repository.data.id, repository);
  }

  /**
   * Remove repository
   */
  removeRepository(repositoryId: string): void {
    this.repositories.delete(repositoryId);
  }

  /**
   * Get repository
   */
  getRepository(repositoryId: string): RepositoryEntity | undefined {
    return this.repositories.get(repositoryId);
  }

  /**
   * Get all repositories
   */
  getAllRepositories(): RepositoryEntity[] {
    return Array.from(this.repositories.values());
  }

  /**
   * Get enabled repositories
   */
  getEnabledRepositories(): RepositoryEntity[] {
    return Array.from(this.repositories.values()).filter(r => r.isEnabled());
  }

  /**
   * Find repository by name
   */
  findByName(name: string): RepositoryEntity | undefined {
    return Array.from(this.repositories.values()).find(
      r => r.data.name === name
    );
  }

  /**
   * Clear all repositories
   */
  clearRepositories(): void {
    this.repositories.clear();
  }

  /**
   * Get repository count
   */
  getRepositoryCount(): number {
    return this.repositories.size;
  }
}
