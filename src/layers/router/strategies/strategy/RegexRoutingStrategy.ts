/**
 * Regex Routing Strategy
 *
 * Matches routes using regular expressions for flexible path matching.
 */

import { IRoutingStrategy } from './IRoutingStrategy';
import { RouteEntity } from '../../domain/entities/RouteEntity';

export class RegexRoutingStrategy implements IRoutingStrategy {
  getName(): string {
    return 'REGEX_ROUTING';
  }

  findRoute(routes: RouteEntity[], path: string, method: string): RouteEntity | undefined {
    const enabledRoutes = routes.filter((r) => r.isEnabled());

    for (const route of enabledRoutes) {
      if (!route.matchesMethod(method)) continue;

      const regex = this._pathToRegex(route.data.path);
      if (regex.test(path)) {
        return route;
      }
    }

    return undefined;
  }

  private _pathToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\*]/g, '\\$&')
      .replace(/\\\*/g, '.*')
      .replace(/\/:([^/]+)/g, '/([^/]+)');

    return new RegExp(`^${escaped}$`);
  }
}
