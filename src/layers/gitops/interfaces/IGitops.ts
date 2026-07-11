/**
 * Gitops Interface
 *
 * Defines the contract for the GitOps deployment reconciliation layer.
 */

import { GitopsResult, GitopsContext } from '../types/gitops-types';

export interface IGitops {
  /**
   * Execute the gitops operation
   */
  execute(context: GitopsContext): Promise<GitopsResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
