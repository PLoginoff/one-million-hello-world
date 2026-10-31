# Wildcard Support

## Overview
Router supports glob-style wildcards in route paths. Register wildcard routes with `registerWildcard`; control behavior via `RouterConfig.wildcardEnabled` and `wildcardBehavior`. `router.match(request)` resolves exact routes before wildcard routes (under `PRIORITY` behavior).

## Syntax

```typescript
router.registerWildcard({ method: HttpMethod.GET, path: '/api/*',     handler: 'api'   });
router.registerWildcard({ method: HttpMethod.GET, path: '/static/**', handler: 'files' });
router.registerWildcard({ method: HttpMethod.GET, path: '/files/:cat/*.png', handler: 'img' });
```

- `*` — matches exactly one path segment.
- `**` — matches zero or more remaining segments (must be last).
- `:name` — named parameter (see `parameter-extraction.md`); mixes freely with wildcards.

Examples: `/api/*` matches `/api/users` but not `/api/users/123` or `/api`. `/static/**` matches `/static/css/a.css`, `/static`, and `/static/`. `/api/:version/*` matches `/api/v1/users` but not `/api/v1/users/123`.

## Configuration

```typescript
interface RouterConfig {
  wildcardEnabled: boolean;
  wildcardBehavior: WildcardBehavior;
}

enum WildcardBehavior {
  STRICT,      // wildcards only match when explicitly enabled
  PERMISSIVE,  // wildcards match even when an exact route exists
  PRIORITY,    // exact routes win over wildcards
}
```

```typescript
const router = new Router({ wildcardEnabled: true, wildcardBehavior: WildcardBehavior.PRIORITY });
```

With `wildcardEnabled: false`, `registerWildcard` still stores the route but `match` won't hit it. `isWildcardRoute(path)` (`*`/`**` present) gates registration — non-wildcard paths throw.

## Match Result

Wildcard hits flag `result.wildcard === true` on the `RouteMatchResult`, alongside `route`, `parameters`, and (in detailed matchers) `matchedPattern`/`matchedSegments`.

```typescript
const r = router.match(req);
if (r.wildcard) { /* r.route is the wildcard Route */ }
```

## Performance

Wildcard matching uses a trie: literal segment → `*` single-segment edge → `**` terminal edge, so lookup is O(segments), not O(routes). Exact routes are checked first under `PRIORITY`, so hot paths stay O(1).

## Best Practices

- Prefer exact routes for hot paths; keep wildcard count low.
- Put `**` only at the end; document whether `PRIORITY` or `PERMISSIVE` is intended.
- Validate wildcard-matched paths — `**` can swallow `..` segments; strip/validate before filesystem access.
