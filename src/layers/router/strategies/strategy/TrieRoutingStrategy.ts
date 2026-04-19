/**
 * Trie Routing Strategy
 * 
 * Matches routes using a trie data structure for efficient lookup.
 */

import { IRoutingStrategy } from './IRoutingStrategy';
import { RouteEntity } from '../../domain/entities/RouteEntity';

interface TrieNode {
  children: Map<string, TrieNode>;
  paramNode?: TrieNode;
  routes: RouteEntity[];
}

export class TrieRoutingStrategy implements IRoutingStrategy {
  private trie: TrieNode;

  constructor() {
    this.trie = { children: new Map(), routes: [] };
  }

  getName(): string {
    return 'TRIE_ROUTING';
  }

  /**
   * Add route to trie
   */
  addRoute(route: RouteEntity): void {
    const segments = route.data.path.split('/').filter(Boolean);
    let node = this.trie;

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        if (!node.paramNode) {
          node.paramNode = { children: new Map(), routes: [] };
        }
        node = node.paramNode;
      } else {
        if (!node.children.has(segment)) {
          node.children.set(segment, { children: new Map(), routes: [] });
        }
        node = node.children.get(segment)!;
      }
    }

    node.routes.push(route);
  }

  /**
   * Find route using trie
   */
  findRoute(routes: RouteEntity[], path: string, method: string): RouteEntity | undefined {
    this.buildTrie(routes);
    const segments = path.split('/').filter(Boolean);
    let node = this.trie;

    for (const segment of segments) {
      if (node.children.has(segment)) {
        node = node.children.get(segment)!;
      } else if (node.paramNode) {
        node = node.paramNode;
      } else {
        return undefined;
      }
    }

    return node.routes.find(route => route.matchesMethod(method) && route.isEnabled());
  }

  private buildTrie(routes: RouteEntity[]): void {
    this.trie = { children: new Map(), routes: [] };
    for (const route of routes) {
      this.addRoute(route);
    }
  }
}
