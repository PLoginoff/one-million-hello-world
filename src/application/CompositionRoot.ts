import { Router } from '../layers/router/implementations/Router';
import { Controller } from '../layers/controller/implementations/Controller';
import { Service } from '../layers/service/implementations/Service';
import { DomainManager } from '../layers/domain/implementations/DomainManager';
import { Repository } from '../layers/repository/implementations/Repository';
import { DomainEntity } from '../layers/domain/types/domain-types';
import { Validator } from '../layers/validation/implementations/Validator';
import { MiddlewareManager } from '../layers/middleware/implementations/MiddlewareManager';
import { SecurityManager } from '../layers/security/implementations/SecurityManager';
import { RateLimiter } from '../layers/rate-limiting/implementations/RateLimiter';
import { CacheManager } from '../layers/cache/implementations/CacheManager';
import { Serializer } from '../layers/serialization/implementations/Serializer';
import { Compressor } from '../layers/compression/implementations/Compressor';
import { CircuitBreaker } from '../layers/circuit-breaker/implementations/CircuitBreaker';
import { RetryPolicy } from '../layers/retry/implementations/RetryPolicy';
import { EventBus } from '../layers/event/implementations/EventBus';
import { MessageQueue } from '../layers/message-queue/implementations/MessageQueue';
import { DataTransformer } from '../layers/data-transformation/implementations/DataTransformer';
import { SagaManager } from '../layers/saga/implementations/SagaManager';
import { StrategyManager } from '../layers/strategy/implementations/StrategyManager';
import { Facade } from '../layers/facade/implementations/Facade';
import { Proxy } from '../layers/proxy/implementations/Proxy';
import { Decorator } from '../layers/decorator/implementations/Decorator';
import { Transport } from '../layers/transport/implementations/Transport';
import { HttpMethod } from '../layers/http-parser/types/http-parser-types';
import { RoutePriority } from '../layers/router/types/router-types';
import { GetHelloWorldUseCase } from '../layers/service/use-cases/GetHelloWorldUseCase';
import { GetHealthCheckUseCase } from '../layers/service/use-cases/GetHealthCheckUseCase';
import { GetMetricsUseCase } from '../layers/service/use-cases/GetMetricsUseCase';
import { GetVersionUseCase } from '../layers/service/use-cases/GetVersionUseCase';
import { createHelloWorldHandler } from '../layers/controller/handlers/HelloWorldHandler';
import { createHealthCheckHandler } from '../layers/controller/handlers/HealthCheckHandler';
import { createMetricsHandler } from '../layers/controller/handlers/MetricsHandler';
import { createVersionHandler } from '../layers/controller/handlers/VersionHandler';
import { LayerRegistry } from './LayerRegistry';

export class CompositionRoot {
  readonly router: Router;
  readonly controller: Controller;
  readonly service: Service;
  readonly domainManager: DomainManager;
  readonly repository: Repository<DomainEntity>;
  readonly validator: Validator;
  readonly middlewareManager: MiddlewareManager;
  readonly securityManager: SecurityManager;
  readonly rateLimiter: RateLimiter;
  readonly cacheManager: CacheManager;
  readonly serializer: Serializer;
  readonly compressor: Compressor;
  readonly circuitBreaker: CircuitBreaker;
  readonly retryPolicy: RetryPolicy;
  readonly eventBus: EventBus;
  readonly messageQueue: MessageQueue;
  readonly dataTransformer: DataTransformer;
  readonly sagaManager: SagaManager;
  readonly strategyManager: StrategyManager;
  readonly facade: Facade;
  readonly proxy: Proxy;
  readonly decorator: Decorator;
  readonly transport: Transport;
  readonly registry: LayerRegistry;

  constructor() {
    this.registry = new LayerRegistry();

    this.router = new Router();
    this.controller = new Controller();
    this.service = new Service();
    this.domainManager = new DomainManager();
    this.repository = new Repository();
    this.validator = new Validator();
    this.middlewareManager = new MiddlewareManager();
    this.securityManager = new SecurityManager();
    this.rateLimiter = new RateLimiter();
    this.cacheManager = new CacheManager();
    this.serializer = new Serializer();
    this.compressor = new Compressor();
    this.circuitBreaker = new CircuitBreaker();
    this.retryPolicy = new RetryPolicy();
    this.eventBus = new EventBus();
    this.messageQueue = new MessageQueue();
    this.dataTransformer = new DataTransformer();
    this.sagaManager = new SagaManager();
    this.strategyManager = new StrategyManager();
    this.facade = new Facade();
    this.proxy = new Proxy();
    this.decorator = new Decorator();
    this.transport = new Transport();

    this._registerUseCases();
    this._registerRoutes();
    this._registerHandlers();
  }

  private _registerUseCases(): void {
    const layerCount = this.registry.getLayerCount();
    this.service.registerUseCase(new GetHelloWorldUseCase(this.domainManager));
    this.service.registerUseCase(new GetHealthCheckUseCase('1.0.0', layerCount));
    this.service.registerUseCase(new GetMetricsUseCase(layerCount));
    this.service.registerUseCase(new GetVersionUseCase('1.0.0', layerCount));
  }

  private _registerRoutes(): void {
    this.router.registerRoute({
      method: HttpMethod.GET,
      path: '/',
      handler: 'HelloWorld',
      priority: RoutePriority.HIGH,
    });

    this.router.registerRoute({
      method: HttpMethod.GET,
      path: '/health',
      handler: 'HealthCheck',
      priority: RoutePriority.MEDIUM,
    });

    this.router.registerRoute({
      method: HttpMethod.GET,
      path: '/metrics',
      handler: 'Metrics',
      priority: RoutePriority.MEDIUM,
    });

    this.router.registerRoute({
      method: HttpMethod.GET,
      path: '/version',
      handler: 'Version',
      priority: RoutePriority.MEDIUM,
    });
  }

  private _registerHandlers(): void {
    this.controller.registerHandler('HelloWorld', createHelloWorldHandler(this.service));
    this.controller.registerHandler('HealthCheck', createHealthCheckHandler(this.service));
    this.controller.registerHandler('Metrics', createMetricsHandler(this.service));
    this.controller.registerHandler('Version', createVersionHandler(this.service));
  }
}
