/**
 * Prefix Routing Strategy
 *
 * Matches routes by longest prefix. Useful for group-based routing.
 */

import { IRoutingStrategy } from './IRoutingStrategy';
import { RouteEntity } from '../../domain/entities/RouteEntity';

export class PrefixRoutingStrategy implements IRoutingStrategy {
  getName(): string {
    return 'PREFIX_ROUTING';
  }

  findRoute(routes: RouteEntity[], path: string, method: string): RouteEntity | undefined {
    const enabledRoutes = routes.filter((r) => r.isEnabled() && r.matchesMethod(method));

    const matching = enabledRoutes.filter((r) => path.startsWith(this._getPrefix(r.data.path)));

    if (matching.length === 0) return undefined;

    matching.sort((a, b) => b.data.path.length - a.data.path.length);
    return matching[0];
  }

  private _getPrefix(path: string): string {
    const paramIdx = path.indexOf('/:');
    return paramIdx >= 0 ? path.substring(0, paramIdx) : path;
  }
}
