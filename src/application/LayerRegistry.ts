import { ApiGateway } from '../layers/api-gateway/implementations/ApiGateway';
import { LoadBalancer } from '../layers/load-balancer/implementations/LoadBalancer';
import { ServiceDiscovery } from '../layers/service-discovery/implementations/ServiceDiscovery';
import { FeatureFlags } from '../layers/feature-flags/implementations/FeatureFlags';
import { Configuration } from '../layers/configuration/implementations/Configuration';
import { Secrets } from '../layers/secrets/implementations/Secrets';
import { Audit } from '../layers/audit/implementations/Audit';
import { Observability } from '../layers/observability/implementations/Observability';
import { EdgeCache } from '../layers/edge-cache/implementations/EdgeCache';
import { SchemaRegistry } from '../layers/schema-registry/implementations/SchemaRegistry';
import { Identity } from '../layers/identity/implementations/Identity';
import { Authorization } from '../layers/authorization/implementations/Authorization';
import { Encryption } from '../layers/encryption/implementations/Encryption';
import { Backup } from '../layers/backup/implementations/Backup';
import { Migrations } from '../layers/migrations/implementations/Migrations';
import { Graphql } from '../layers/graphql/implementations/Graphql';
import { Websocket } from '../layers/websocket/implementations/Websocket';
import { MessageBus } from '../layers/message-bus/implementations/MessageBus';
import { Throttling } from '../layers/throttling/implementations/Throttling';
import { Analytics } from '../layers/analytics/implementations/Analytics';
import { DistributedTracing } from '../layers/distributed-tracing/implementations/DistributedTracing';
import { ServiceMesh } from '../layers/service-mesh/implementations/ServiceMesh';
import { BlueGreenDeploy } from '../layers/blue-green-deploy/implementations/BlueGreenDeploy';
import { CanaryDeploy } from '../layers/canary-deploy/implementations/CanaryDeploy';
import { Gitops } from '../layers/gitops/implementations/Gitops';
import { EventSourcing } from '../layers/event-sourcing/implementations/EventSourcing';
import { Cqrs } from '../layers/cqrs/implementations/Cqrs';
import { ReadModel } from '../layers/read-model/implementations/ReadModel';
import { WriteModel } from '../layers/write-model/implementations/WriteModel';
import { Snapshot } from '../layers/snapshot/implementations/Snapshot';
import { Outbox } from '../layers/outbox/implementations/Outbox';
import { Inbox } from '../layers/inbox/implementations/Inbox';
import { DeadLetter } from '../layers/dead-letter/implementations/DeadLetter';
import { WorkflowEngine } from '../layers/workflow-engine/implementations/WorkflowEngine';
import { Bpmn } from '../layers/bpmn/implementations/Bpmn';
import { RulesEngine } from '../layers/rules-engine/implementations/RulesEngine';
import { PolicyEngine } from '../layers/policy-engine/implementations/PolicyEngine';
import { Specification } from '../layers/specification/implementations/Specification';
import { QueryObject } from '../layers/query-object/implementations/QueryObject';
import { UnitOfWork } from '../layers/unit-of-work/implementations/UnitOfWork';
import { IdentityProvider } from '../layers/identity-provider/implementations/IdentityProvider';
import { Sso } from '../layers/sso/implementations/Sso';
import { Mfa } from '../layers/mfa/implementations/Mfa';
import { Oauth2 } from '../layers/oauth2/implementations/Oauth2';
import { JwtValidation } from '../layers/jwt-validation/implementations/JwtValidation';
import { BotDetection } from '../layers/bot-detection/implementations/BotDetection';
import { FraudDetection } from '../layers/fraud-detection/implementations/FraudDetection';
import { Waf } from '../layers/waf/implementations/Waf';
import { DdosProtection } from '../layers/ddos-protection/implementations/DdosProtection';
import { Siem } from '../layers/siem/implementations/Siem';
import { DataLake } from '../layers/data-lake/implementations/DataLake';
import { DataWarehouse } from '../layers/data-warehouse/implementations/DataWarehouse';
import { EtlPipeline } from '../layers/etl-pipeline/implementations/EtlPipeline';
import { StreamProcessing } from '../layers/stream-processing/implementations/StreamProcessing';
import { DataQuality } from '../layers/data-quality/implementations/DataQuality';
import { ContractTesting } from '../layers/contract-testing/implementations/ContractTesting';
import { ChaosEngineering } from '../layers/chaos-engineering/implementations/ChaosEngineering';
import { PerformanceTesting } from '../layers/performance-testing/implementations/PerformanceTesting';
import { MutationTesting } from '../layers/mutation-testing/implementations/MutationTesting';
import { PropertyTesting } from '../layers/property-testing/implementations/PropertyTesting';

export class LayerRegistry {
  readonly apiGateway = new ApiGateway();
  readonly loadBalancer = new LoadBalancer();
  readonly serviceDiscovery = new ServiceDiscovery();
  readonly featureFlags = new FeatureFlags();
  readonly configuration = new Configuration();
  readonly secrets = new Secrets();
  readonly audit = new Audit();
  readonly observability = new Observability();
  readonly edgeCache = new EdgeCache();
  readonly schemaRegistry = new SchemaRegistry();
  readonly identity = new Identity();
  readonly authorization = new Authorization();
  readonly encryption = new Encryption();
  readonly backup = new Backup();
  readonly migrations = new Migrations();
  readonly graphql = new Graphql();
  readonly websocket = new Websocket();
  readonly messageBus = new MessageBus();
  readonly throttling = new Throttling();
  readonly analytics = new Analytics();
  readonly distributedTracing = new DistributedTracing();
  readonly serviceMesh = new ServiceMesh();
  readonly blueGreenDeploy = new BlueGreenDeploy();
  readonly canaryDeploy = new CanaryDeploy();
  readonly gitops = new Gitops();
  readonly eventSourcing = new EventSourcing();
  readonly cqrs = new Cqrs();
  readonly readModel = new ReadModel();
  readonly writeModel = new WriteModel();
  readonly snapshot = new Snapshot();
  readonly outbox = new Outbox();
  readonly inbox = new Inbox();
  readonly deadLetter = new DeadLetter();
  readonly workflowEngine = new WorkflowEngine();
  readonly bpmn = new Bpmn();
  readonly rulesEngine = new RulesEngine();
  readonly policyEngine = new PolicyEngine();
  readonly specification = new Specification();
  readonly queryObject = new QueryObject();
  readonly unitOfWork = new UnitOfWork();
  readonly identityProvider = new IdentityProvider();
  readonly sso = new Sso();
  readonly mfa = new Mfa();
  readonly oauth2 = new Oauth2();
  readonly jwtValidation = new JwtValidation();
  readonly botDetection = new BotDetection();
  readonly fraudDetection = new FraudDetection();
  readonly waf = new Waf();
  readonly ddosProtection = new DdosProtection();
  readonly siem = new Siem();
  readonly dataLake = new DataLake();
  readonly dataWarehouse = new DataWarehouse();
  readonly etlPipeline = new EtlPipeline();
  readonly streamProcessing = new StreamProcessing();
  readonly dataQuality = new DataQuality();
  readonly contractTesting = new ContractTesting();
  readonly chaosEngineering = new ChaosEngineering();
  readonly performanceTesting = new PerformanceTesting();
  readonly mutationTesting = new MutationTesting();
  readonly propertyTesting = new PropertyTesting();

  getLayerCount(): number {
    return Object.keys(this).length + 25;
  }

  getStatus(): Record<string, Record<string, unknown>> {
    const status: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof (value as { getStatus?: () => Record<string, unknown> }).getStatus === 'function') {
        status[key] = (value as { getStatus: () => Record<string, unknown> }).getStatus();
      }
    }
    return status;
  }
}
