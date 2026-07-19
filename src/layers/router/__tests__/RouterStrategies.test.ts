/**
 * Router Strategies Unit Tests
 */

import { RegexRoutingStrategy } from '../strategies/strategy/RegexRoutingStrategy';
import { PrefixRoutingStrategy } from '../strategies/strategy/PrefixRoutingStrategy';
import { RouteEntity } from '../domain/entities/RouteEntity';

describe('RegexRoutingStrategy', () => {
  let strategy: RegexRoutingStrategy;

  beforeEach(() => {
    strategy = new RegexRoutingStrategy();
  });

  it('should return name REGEX_ROUTING', () => {
    expect(strategy.getName()).toBe('REGEX_ROUTING');
  });

  it('should match exact path', () => {
    const route = RouteEntity.get('r1', '/hello', 'helloHandler');
    const found = strategy.findRoute([route], '/hello', 'GET');
    expect(found).toBeDefined();
    expect(found!.data.id).toBe('r1');
  });

  it('should match parameterized path', () => {
    const route = RouteEntity.get('r1', '/users/:id', 'userHandler');
    const found = strategy.findRoute([route], '/users/123', 'GET');
    expect(found).toBeDefined();
  });

  it('should match wildcard path', () => {
    const route = RouteEntity.get('r1', '/api/*', 'apiHandler');
    const found = strategy.findRoute([route], '/api/anything/here', 'GET');
    expect(found).toBeDefined();
  });

  it('should not match wrong method', () => {
    const route = RouteEntity.get('r1', '/hello', 'helloHandler');
    const found = strategy.findRoute([route], '/hello', 'POST');
    expect(found).toBeUndefined();
  });

  it('should not match non-matching path', () => {
    const route = RouteEntity.get('r1', '/hello', 'helloHandler');
    const found = strategy.findRoute([route], '/goodbye', 'GET');
    expect(found).toBeUndefined();
  });

  it('should skip disabled routes', () => {
    const route = RouteEntity.get('r1', '/hello', 'helloHandler');
    const disabled = route.disable();
    const found = strategy.findRoute([disabled], '/hello', 'GET');
    expect(found).toBeUndefined();
  });
});

describe('PrefixRoutingStrategy', () => {
  let strategy: PrefixRoutingStrategy;

  beforeEach(() => {
    strategy = new PrefixRoutingStrategy();
  });

  it('should return name PREFIX_ROUTING', () => {
    expect(strategy.getName()).toBe('PREFIX_ROUTING');
  });

  it('should match by prefix', () => {
    const route = RouteEntity.get('r1', '/api/v1', 'handler');
    const found = strategy.findRoute([route], '/api/v1/users', 'GET');
    expect(found).toBeDefined();
  });

  it('should match longest prefix', () => {
    const short = RouteEntity.get('r1', '/api', 'handler1');
    const long = RouteEntity.get('r2', '/api/v1', 'handler2');
    const found = strategy.findRoute([short, long], '/api/v1/users', 'GET');
    expect(found!.data.id).toBe('r2');
  });

  it('should not match wrong method', () => {
    const route = RouteEntity.get('r1', '/api', 'handler');
    const found = strategy.findRoute([route], '/api/users', 'POST');
    expect(found).toBeUndefined();
  });

  it('should not match non-prefix path', () => {
    const route = RouteEntity.get('r1', '/api', 'handler');
    const found = strategy.findRoute([route], '/other/path', 'GET');
    expect(found).toBeUndefined();
  });
});
