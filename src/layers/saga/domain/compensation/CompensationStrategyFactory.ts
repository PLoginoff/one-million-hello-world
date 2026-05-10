/**
 * Compensation Strategy Factory
 *
 * Factory for creating compensation strategies.
 * Provides convenient methods for creating configured strategies.
 */

import { BackwardCompensationStrategy } from './BackwardCompensationStrategy';
import { ForwardCompensationStrategy } from './ForwardCompensationStrategy';
import { ParallelCompensationStrategy } from './ParallelCompensationStrategy';

export type CompensationStrategyType = 'backward' | 'forward' | 'parallel';

export class CompensationStrategyFactory {
  /**
   * Create backward compensation strategy
   */
  static createBackward(): BackwardCompensationStrategy {
    return new BackwardCompensationStrategy();
  }

  /**
   * Create forward compensation strategy
   */
  static createForward(): ForwardCompensationStrategy {
    return new ForwardCompensationStrategy();
  }

  /**
   * Create parallel compensation strategy
   */
  static createParallel(): ParallelCompensationStrategy {
    return new ParallelCompensationStrategy();
  }

  /**
   * Create strategy by type
   */
  static createByType(type: CompensationStrategyType): any {
    switch (type) {
      case 'backward':
        return this.createBackward();
      case 'forward':
        return this.createForward();
      case 'parallel':
        return this.createParallel();
      default:
        throw new Error(`Unknown compensation strategy type: ${type}`);
    }
  }
}
