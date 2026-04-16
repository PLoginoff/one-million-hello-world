# Route Matching

## Overview
The Router Layer implements flexible route matching strategies including exact path matching, method-based routing, and configurable case sensitivity.

## Route Definition

### Route Structure
```typescript
interface Route {
  method: HttpMethod;
  path: string;
  handler: string;
  middleware?: string[];
  parameters?: RouteParameter[];
}

interface RouteParameter {
  name: string;
  type: ParameterType;
  pattern?: string;
  required: boolean;
}

enum ParameterType {
  STRING,
  NUMBER,
  BOOLEAN,
  UUID,
  CUSTOM
}
```

## Route Registration

### Route Registration
```typescript
class Router {
  private routes: Map<string, Route> = new Map();
  private config: RouterConfig;
  
  register(route: Route): void {
    const key = this.getRouteKey(route.method, route.path);
    this.routes.set(key, route);
  }
  
  registerBatch(routes: Route[]): void {
    for (const route of routes) {
      this.register(route);
    }
  }
  
  unregister(method: HttpMethod, path: string): void {
    const key = this.getRouteKey(method, path);
    this.routes.delete(key);
  }
  
  clear(): void {
    this.routes.clear();
  }
  
  private getRouteKey(method: HttpMethod, path: string): string {
    return `${method}:${path}`;
  }
}
```

### Route Enumeration
```typescript
class Router {
  getAllRoutes(): Route[] {
    return Array.from(this.routes.values());
  }
  
  getRoutesByMethod(method: HttpMethod): Route[] {
    return Array.from(this.routes.values()).filter(r => r.method === method);
  }
  
  getRoute(method: HttpMethod, path: string): Route | undefined {
    const key = this.getRouteKey(method, path);
    return this.routes.get(key);
  }
}
```

## Exact Path Matching

### Exact Match Implementation
```typescript
class ExactPathMatcher {
  match(requestPath: string, routePath: string, caseSensitive: boolean): boolean {
    if (caseSensitive) {
      return requestPath === routePath;
    }
    
    return requestPath.toLowerCase() === routePath.toLowerCase();
  }
}
```

### Method-Based Matching
```typescript
class MethodMatcher {
  match(requestMethod: HttpMethod, routeMethod: HttpMethod): boolean {
    return requestMethod === routeMethod;
  }
}
```

## Case Sensitivity

### Case Sensitivity Configuration
```typescript
interface RouterConfig {
  caseSensitive: boolean;
  strictRouting: boolean;
  wildcardEnabled: boolean;
}

class Router {
  private config: RouterConfig;
  
  setCaseSensitive(enabled: boolean): void {
    this.config.caseSensitive = enabled;
  }
  
  isCaseSensitive(): boolean {
    return this.config.caseSensitive;
  }
}
```

### Case-Insensitive Matching
```typescript
class CaseInsensitiveMatcher {
  match(requestPath: string, routePath: string): boolean {
    return requestPath.toLowerCase() === routePath.toLowerCase();
  }
}
```

## Route Matching Algorithm

### Main Matching Logic
```typescript
class Router {
  match(request: HttpRequest): RouteMatchResult {
    const requestPath = this.normalizePath(request.uri);
    const requestMethod = request.method;
    
    for (const route of this.routes.values()) {
      const routePath = this.normalizePath(route.path);
      
      // Check method match
      if (!this.matchMethod(requestMethod, route.method)) {
        continue;
      }
      
      // Check path match
      if (this.matchPath(requestPath, routePath)) {
        return {
          matched: true,
          route,
          parameters: this.extractParameters(requestPath, routePath),
          wildcard: false
        };
      }
    }
    
    // Check wildcard routes
    if (this.config.wildcardEnabled) {
      const wildcardMatch = this.matchWildcard(requestPath, requestMethod);
      if (wildcardMatch) {
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
  
  private matchMethod(requestMethod: HttpMethod, routeMethod: HttpMethod): boolean {
    return requestMethod === routeMethod;
  }
  
  private matchPath(requestPath: string, routePath: string): boolean {
    if (this.config.caseSensitive) {
      return requestPath === routePath;
    }
    
    return requestPath.toLowerCase() === routePath.toLowerCase();
  }
  
  private normalizePath(path: string): string {
    // Remove trailing slash
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    return path;
  }
}
```

### Route Match Result
```typescript
interface RouteMatchResult {
  matched: boolean;
  route: Route | null;
  parameters: Map<string, any>;
  wildcard: boolean;
}
```

## Strict Routing Mode

### Strict Mode Configuration
```typescript
class Router {
  setStrictRouting(enabled: boolean): void {
    this.config.strictRouting = enabled;
  }
  
  isStrictRouting(): boolean {
    return this.config.strictRouting;
  }
}
```

### Strict Mode Behavior
```typescript
class StrictPathMatcher {
  match(requestPath: string, routePath: string, strict: boolean): boolean {
    if (strict) {
      // Exact match required
      return requestPath === routePath;
    }
    
    // Allow trailing slash
    const normalizedRequest = this.normalizePath(requestPath);
    const normalizedRoute = this.normalizePath(routePath);
    
    return normalizedRequest === normalizedRoute;
  }
  
  private normalizePath(path: string): string {
    if (path.endsWith('/') && path.length > 1) {
      return path.slice(0, -1);
    }
    return path;
  }
}
```

## Route Priority

### Priority-Based Matching
```typescript
interface PriorityRoute extends Route {
  priority: number;
}

class PriorityRouter {
  private routes: PriorityRoute[] = [];
  
  register(route: PriorityRoute): void {
    this.routes.push(route);
    this.routes.sort((a, b) => b.priority - a.priority);
  }
  
  match(request: HttpRequest): RouteMatchResult {
    for (const route of this.routes) {
      if (this.matches(request, route)) {
        return {
          matched: true,
          route,
          parameters: this.extractParameters(request.uri, route.path),
          wildcard: false
        };
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

## Best Practices

### Route Design Guidelines
- Use descriptive route paths
- Group related routes with common prefixes
- Use consistent naming conventions
- Avoid route conflicts
- Document route parameters

### Performance Considerations
- Cache route matches when possible
- Use efficient data structures for route storage
- Implement early termination for method mismatches
- Normalize paths once during registration
- Consider using a trie for large route sets

### Security Considerations
- Validate all route parameters
- Sanitize route paths before matching
- Implement route-based access control
- Monitor for route abuse patterns
