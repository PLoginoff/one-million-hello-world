/**
 * Controller Strategy Interface
 * 
 * Defines contract for different controller strategies.
 */

import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export interface IControllerStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Resolve controller instance
   */
  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject): any;
}
