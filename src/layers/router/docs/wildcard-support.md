# Wildcard Support

## Overview
The Router Layer supports glob-style wildcard matching for flexible route patterns. Wildcards allow matching multiple paths with a single route definition.

## Wildcard Syntax

### Glob-Style Wildcards
```typescript
// Wildcard route examples
const wildcardRoutes: Route[] = [
  {
    method: HttpMethod.GET,
    path: '/api/*',
    handler: 'apiHandler'
  },
  {
    method: HttpMethod.GET,
    path: '/static/**',
    handler: 'staticHandler'
  },
  {
    method: HttpMethod.GET,
    path: '/files/:category/*.png',
    handler: 'imageHandler'
  }
];
```

### Wildcard Patterns
```typescript
enum WildcardType {
  SINGLE = '*',    // Matches single path segment
  DOUBLE = '**',   // Matches multiple path segments
  PARAMETER = ':name'  // Matches named parameter
}
```

## Wildcard Matching

### Single Wildcard (*)
```typescript
class SingleWildcardMatcher {
  match(requestPath: string, routePath: string): boolean {
    const requestSegments = requestPath.split('/');
    const routeSegments = routePath.split('/');
    
    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      
      if (routeSegment === '*') {
        // Match any single segment
        continue;
      }
      
      if (routeSegment !== requestSegments[i]) {
        return false;
      }
    }
    
    return true;
  }
}

// Example:
// Route: /api/*
// Matches: /api/users, /api/posts, /api/settings
// Does not match: /api/users/123, /api
```

### Double Wildcard (**)
```typescript
class DoubleWildcardMatcher {
  match(requestPath: string, routePath: string): boolean {
    const requestSegments = requestPath.split('/');
    const routeSegments = routePath.split('/');
    
    let routeIndex = 0;
    let requestIndex = 0;
    
    while (routeIndex < routeSegments.length && requestIndex < requestSegments.length) {
      const routeSegment = routeSegments[routeIndex];
      
      if (routeSegment === '**') {
        // Match remaining segments
        return true;
      }
      
      if (routeSegment === requestSegments[requestIndex]) {
        routeIndex++;
        requestIndex++;
      } else {
        return false;
      }
    }
    
    return routeIndex === routeSegments.length;
  }
}

// Example:
// Route: /static/**
// Matches: /static/css/style.css, /static/js/app.js, /static/images/logo.png
// Matches: /static, /static/
```

### Mixed Wildcards
```typescript
class MixedWildcardMatcher {
  match(requestPath: string, routePath: string): boolean {
    const requestSegments = requestPath.split('/');
    const routeSegments = routePath.split('/');
    
    let routeIndex = 0;
    let requestIndex = 0;
    
    while (routeIndex < routeSegments.length && requestIndex < requestSegments.length) {
      const routeSegment = routeSegments[routeIndex];
      
      if (routeSegment === '**') {
        // Match remaining segments
        return true;
      }
      
      if (routeSegment === '*') {
        // Match single segment
        routeIndex++;
        requestIndex++;
        continue;
      }
      
      if (routeSegment === requestSegments[requestIndex]) {
        routeIndex++;
        requestIndex++;
      } else {
        return false;
      }
    }
    
    // Handle trailing wildcard
    if (routeIndex < routeSegments.length && routeSegments[routeIndex] === '**') {
      return true;
    }
    
    return routeIndex === routeSegments.length && requestIndex === requestSegments.length;
  }
}

// Example:
// Route: /api/:version/*
// Matches: /api/v1/users, /api/v2/posts
// Does not match: /api/v1/users/123
```

## Wildcard Configuration

### Wildcard Enable/Disable
```typescript
interface RouterConfig {
  wildcardEnabled: boolean;
  wildcardBehavior: WildcardBehavior;
}

enum WildcardBehavior {
  STRICT,      // Wildcards only match if explicitly enabled
  PERMISSIVE,  // Wildcards match even if exact route exists
  PRIORITY     // Exact routes have priority over wildcards
}

class Router {
  private config: RouterConfig;
  
  enableWildcard(): void {
    this.config.wildcardEnabled = true;
  }
  
  disableWildcard(): void {
    this.config.wildcardEnabled = false;
  }
  
  setWildcardBehavior(behavior: WildcardBehavior): void {
    this.config.wildcardBehavior = behavior;
  }
}
```

### Priority-Based Wildcard Matching
```typescript
class PriorityWildcardRouter {
  match(request: HttpRequest): RouteMatchResult {
    // First try exact match
    const exactMatch = this.matchExact(request);
    if (exactMatch.matched) {
      return exactMatch;
    }
    
    // Then try wildcard match if enabled
    if (this.config.wildcardEnabled) {
      const wildcardMatch = this.matchWildcard(request);
      if (wildcardMatch.matched) {
        return wildcardMatch;
      }
    }
    
    return {
      matched: false,
      route: null,
      parameters: new Map(),
      wildcard: false
    };
  }
}
```

## Wildcard Route Registration

### Wildcard Route Registration
```typescript
class WildcardRouter {
  private wildcardRoutes: Route[] = [];
  
  registerWildcard(route: Route): void {
    if (!this.isWildcardRoute(route.path)) {
      throw new Error('Route is not a wildcard route');
    }
    
    this.wildcardRoutes.push(route);
  }
  
  private isWildcardRoute(path: string): boolean {
    return path.includes('*') || path.includes('**');
  }
}
```

### Wildcard Route Examples
```typescript
// API wildcard
router.registerWildcard({
  method: HttpMethod.GET,
  path: '/api/*',
  handler: 'apiHandler'
});

// Static files wildcard
router.registerWildcard({
  method: HttpMethod.GET,
  path: '/static/**',
  handler: 'staticFileHandler'
});

// Category wildcard
router.registerWildcard({
  method: HttpMethod.GET,
  path: '/products/:category/*',
  handler: 'categoryHandler'
});
```

## Wildcard Match Result

### Wildcard Match Information
```typescript
interface WildcardMatchResult extends RouteMatchResult {
  wildcard: true;
  matchedPattern: string;
  matchedSegments: string[];
}

class WildcardMatcher {
  matchWithDetails(requestPath: string, routePath: string): WildcardMatchResult {
    if (!this.match(requestPath, routePath)) {
      return {
        matched: false,
        route: null,
        parameters: new Map(),
        wildcard: true,
        matchedPattern: '',
        matchedSegments: []
      };
    }
    
    const matchedSegments = this.extractMatchedSegments(requestPath, routePath);
    
    return {
      matched: true,
      route: null,
      parameters: new Map(),
      wildcard: true,
      matchedPattern: routePath,
      matchedSegments
    };
  }
  
  private extractMatchedSegments(requestPath: string, routePath: string): string[] {
    const requestSegments = requestPath.split('/');
    const routeSegments = routePath.split('/');
    const matched: string[] = [];
    
    for (let i = 0; i < requestSegments.length; i++) {
      if (i < routeSegments.length && routeSegments[i] !== '*') {
        matched.push(requestSegments[i]);
      } else {
        matched.push(requestSegments[i]);
      }
    }
    
    return matched;
  }
}
```

## Wildcard Performance

### Wildcard Optimization
```typescript
class OptimizedWildcardRouter {
  private wildcardTrie: WildcardTrie;
  
  match(requestPath: string): Route | null {
    return this.wildcardTrie.search(requestPath);
  }
}

class WildcardTrie {
  private root: TrieNode;
  
  insert(pattern: string, route: Route): void {
    const segments = pattern.split('/');
    let current = this.root;
    
    for (const segment of segments) {
      if (segment === '*') {
        if (!current.wildcardChild) {
          current.wildcardChild = new TrieNode();
        }
        current = current.wildcardChild;
      } else if (segment === '**') {
        current.doubleWildcard = true;
        current.route = route;
        return;
      } else {
        if (!current.children[segment]) {
          current.children[segment] = new TrieNode();
        }
        current = current.children[segment];
      }
    }
    
    current.route = route;
  }
  
  search(path: string): Route | null {
    const segments = path.split('/');
    return this.searchRecursive(segments, 0, this.root);
  }
  
  private searchRecursive(segments: string[], index: number, node: TrieNode): Route | null {
    if (index >= segments.length) {
      return node.route || null;
    }
    
    const segment = segments[index];
    
    // Check exact match
    if (node.children[segment]) {
      const result = this.searchRecursive(segments, index + 1, node.children[segment]);
      if (result) return result;
    }
    
    // Check wildcard
    if (node.wildcardChild) {
      const result = this.searchRecursive(segments, index + 1, node.wildcardChild);
      if (result) return result;
    }
    
    // Check double wildcard
    if (node.doubleWildcard) {
      return node.route;
    }
    
    return null;
  }
}

interface TrieNode {
  children: Map<string, TrieNode>;
  wildcardChild: TrieNode | null;
  doubleWildcard: boolean;
  route: Route | null;
}
```

## Best Practices

### Wildcard Design Guidelines
- Use wildcards sparingly for better performance
- Prefer explicit routes over wildcards when possible
- Document wildcard behavior clearly
- Test wildcard patterns thoroughly
- Consider security implications of wildcards

### Performance Considerations
- Use trie data structure for wildcard matching
- Cache wildcard match results
- Limit wildcard route count
- Profile wildcard matching performance
- Consider using external routing libraries for complex patterns

### Security Considerations
- Validate wildcard-matched paths
- Prevent directory traversal attacks
- Implement access control for wildcard routes
- Monitor wildcard route abuse
