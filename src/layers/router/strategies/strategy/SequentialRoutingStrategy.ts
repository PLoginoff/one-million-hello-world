/**
 * Sequential Routing Strategy
 * 
 * Matches routes sequentially in order of priority.
 */

import { IRoutingStrategy } from './IRoutingStrategy';
import { RouteEntity } from '../../domain/entities/RouteEntity';

export class SequentialRoutingStrategy implements IRoutingStrategy {
  getName(): string {
    return 'SEQUENTIAL_ROUTING';
  }

  findRoute(routes: RouteEntity[], path: string, method: string): RouteEntity | undefined {
    const sortedRoutes = routes
      .filter(route => route.isEnabled())
      .sort((a, b) => a.data.priority - b.data.priority);

    for (const route of sortedRoutes) {
      if (route.matchesPath(path) && route.matchesMethod(method)) {
        return route;
      }
    }

    return undefined;
  }
}
