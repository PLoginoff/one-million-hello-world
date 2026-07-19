#!/usr/bin/env node

/**
 * Generate documentation for all layers
 * - docs/adr/ — top-level ADRs for major architectural decisions
 * - per-layer: docs/adr.md, docs/testing.md, docs/configuration.md
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LAYERS_DIR = path.join(ROOT, 'src', 'layers');
const DOCS_DIR = path.join(ROOT, 'docs');
const ADR_DIR = path.join(DOCS_DIR, 'adr');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase());
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function generateLayerAdr(name, description) {
  var pascal = toPascalCase(name);
  return [
    '# ADR: ' + pascal + ' Layer',
    '',
    '## Status',
    'Accepted',
    '',
    '## Context',
    'The system requires a ' + description + ' layer to handle ' + name.replace(/-/g, ' ') + ' concerns.',
    'This layer must be independent, testable, and integrate with the pipeline.',
    '',
    '## Decision',
    'Implement ' + pascal + ' as a standalone layer with:',
    '- Interface (I' + pascal + ') defining the contract',
    '- Implementation (' + pascal + ') with configurable behavior',
    '- Domain model (entity, value object, domain service)',
    '- Health check, metrics collector, and error mapper',
    '- Adapters where applicable (in-memory + real service)',
    '',
    '## Consequences',
    '**Positive:**',
    '- Clear separation of concerns',
    '- Independent testability',
    '- Pluggable adapters for different backends',
    '',
    '**Negative:**',
    '- Additional abstraction layer',
    '- Slight overhead from indirection',
    '',
    '## Alternatives Considered',
    '1. Inline logic in controller — rejected: tight coupling',
    '2. Utility module — rejected: no interface contract',
    '3. External library — rejected: vendor lock-in risk',
    '',
    '## References',
    '- Layer architecture: docs/' + name + '-layer-architecture.md',
    '- Interface: src/layers/' + name + '/interfaces/I' + pascal + '.ts',
    '',
  ].join('\n');
}

function generateLayerTesting(name) {
  var pascal = toPascalCase(name);
  return [
    '# Testing: ' + pascal + ' Layer',
    '',
    '## Unit Tests',
    '- Implementation tests: ' + pascal + '.test.ts',
    '- Domain tests: ' + pascal + 'Domain.test.ts',
    '',
    '## Test Coverage',
    '- Happy path: execute() returns success result',
    '- Configuration: configure() updates status',
    '- Status: getStatus() returns layer info',
    '- Domain entity: create, update, immutability',
    '- Value object: create, equality, toString',
    '- Domain service: validate, merge',
    '',
    '## Running Tests',
    '```bash',
    'npx jest --testPathPattern=' + name,
    '```',
    '',
    '## Integration Points',
    'Test with adjacent layers using in-memory adapters.',
    '',
  ].join('\n');
}

function generateLayerConfiguration(name) {
  var pascal = toPascalCase(name);
  return [
    '# Configuration: ' + pascal + ' Layer',
    '',
    '## Default Configuration',
    '```json',
    '{',
    '  "enabled": true,',
    '  "timeout": 30000,',
    '  "retries": 3,',
    '  "logLevel": "info"',
    '}',
    '```',
    '',
    '## Configuration Options',
    '| Option | Type | Default | Description |',
    '|--------|------|---------|-------------|',
    '| enabled | boolean | true | Enable/disable layer |',
    '| timeout | number | 30000 | Operation timeout in ms |',
    '| retries | number | 3 | Number of retry attempts |',
    '| logLevel | string | "info" | Logging verbosity |',
    '',
    '## Environment Variables',
    '| Variable | Description |',
    '|----------|-------------|',
    '| ' + name.toUpperCase().replace(/-/g, '_') + '_ENABLED | Enable layer (default: true) |',
    '| ' + name.toUpperCase().replace(/-/g, '_') + '_TIMEOUT | Timeout in ms |',
    '',
  ].join('\n');
}

function generateTopLevelAdr(number, title, context, decision, consequences) {
  return [
    '# ADR-' + number + ': ' + title,
    '',
    '## Status',
    'Accepted',
    '',
    '## Date',
    new Date().toISOString().split('T')[0],
    '',
    '## Context',
    context,
    '',
    '## Decision',
    decision,
    '',
    '## Consequences',
    consequences,
    '',
    '## Alternatives Considered',
    'See discussion in context section above.',
    '',
  ].join('\n');
}

// Generate per-layer docs
var layers = fs.readdirSync(LAYERS_DIR).filter(function(f) {
  return fs.statSync(path.join(LAYERS_DIR, f)).isDirectory();
});

var layerCount = 0;
var docsGenerated = 0;

for (var i = 0; i < layers.length; i++) {
  var name = layers[i];
  var docsPath = path.join(LAYERS_DIR, name, 'docs');
  if (!fs.existsSync(docsPath)) continue;

  layerCount++;

  var adrPath = path.join(docsPath, 'adr.md');
  if (!fs.existsSync(adrPath)) {
    writeFile(adrPath, generateLayerAdr(name, name.replace(/-/g, ' ')));
    docsGenerated++;
  }

  var testingPath = path.join(docsPath, 'testing.md');
  if (!fs.existsSync(testingPath)) {
    writeFile(testingPath, generateLayerTesting(name));
    docsGenerated++;
  }

  var configPath = path.join(docsPath, 'configuration.md');
  if (!fs.existsSync(configPath)) {
    writeFile(configPath, generateLayerConfiguration(name));
    docsGenerated++;
  }
}

// Generate top-level ADRs
fs.mkdirSync(ADR_DIR, { recursive: true });

var topAdrs = [
  ['001', 'Layered Architecture',
    'The system needs a scalable architecture for a "Hello World" service that demonstrates enterprise patterns.',
    'Adopt a 104-layer architecture with clear separation: core pipeline (network → HTTP → router → controller → service → domain → repository) and horizontal cross-cutting layers.',
    'High modularity and testability. Each layer is independently deployable and testable. Trade-off: increased complexity and indirection.'],
  ['002', 'TypeScript as Implementation Language',
    'Need a language that supports strong typing, interfaces, and modern tooling.',
    'Use TypeScript with strict mode enabled, ESLint with @typescript-eslint plugin, and Jest for testing.',
    'Type safety catches bugs at compile time. IDE support is excellent. Trade-off: compilation step required.'],
  ['003', 'Interface-Based Layer Contracts',
    'Each layer needs a well-defined contract that can be mocked for testing.',
    'Every layer exposes an interface (I{LayerName}) that defines execute(), configure(), and getStatus(). Implementations are separate classes.',
    'Clear contracts enable easy mocking. Adapters can swap implementations. Trade-off: boilerplate per layer.'],
  ['004', 'Domain-Driven Design per Layer',
    'Layers need rich domain models, not just procedural logic.',
    'Each layer includes domain/entities, domain/value-objects, and domain/services following DDD patterns.',
    'Rich domain models encapsulate business logic. Value objects ensure immutability. Trade-off: more files per layer.'],
  ['005', 'Health Check Pattern',
    'Production systems need health monitoring for each component.',
    'Each layer implements a HealthCheck class that checks execution count, success rate, and average execution time.',
    'Granular health visibility. Aggregation to overall system health. Trade-off: metrics collection overhead.'],
  ['006', 'Prometheus Metrics Export',
    'Need standardized metrics export for monitoring.',
    'Each layer has a PrometheusMetricsCollector that exports counters and gauges in Prometheus format.',
    'Compatible with Prometheus/Grafana ecosystem. Trade-off: metric naming conventions must be consistent.'],
  ['007', 'Error Taxonomy and Mapping',
    'Errors need consistent classification for retry logic and HTTP status mapping.',
    'Each layer has a custom Error class (with code, statusCode) and an ErrorMapper that maps to retryable status.',
    'Consistent error handling across layers. Retryable classification enables smart retries. Trade-off: per-layer error classes.'],
  ['008', 'Adapter Pattern for External Dependencies',
    'Layers that interact with external services need swappable implementations.',
    'Infrastructure layers (secrets, encryption, message queue, etc.) have in-memory and real-service adapters.',
    'Testability with in-memory adapters. Production swappability. Trade-off: adapter interface maintenance.'],
  ['009', 'Strategy Pattern for Configurable Behavior',
    'Some layers need multiple algorithms (e.g., load balancing, rate limiting, compression).',
    'Use Strategy pattern with IStrategy interface and multiple strategy implementations per layer.',
    'Runtime algorithm selection. Easy to add new strategies. Trade-off: strategy registration overhead.'],
  ['010', 'Composite and Conditional Validation',
    'Validation needs to combine multiple rules with conditional logic.',
    'Implement CompositeValidationStrategy and ConditionalValidationStrategy for flexible validation chains.',
    'Composable validation rules. Conditional logic support. Trade-off: validation tree complexity.'],
  ['011', 'Circuit Breaker for Resilience',
    'External service calls need protection against cascading failures.',
    'Implement circuit breaker pattern with configurable thresholds and state transitions (closed, open, half-open).',
    'Prevents cascading failures. Automatic recovery. Trade-off: potential false positives during transient issues.'],
  ['012', 'Event Sourcing and CQRS',
    'Complex domains benefit from event-driven architecture and read/write separation.',
    'Implement event sourcing, CQRS, read model, and write model as separate layers with outbox/inbox patterns.',
    'Audit trail via events. Scalable reads. Trade-off: eventual consistency and complexity.'],
  ['013', 'Multi-Tenancy Isolation',
    'SaaS applications need tenant isolation at the data and execution level.',
    'Implement multi-tenancy layer with tenant context propagation and isolation strategies (shared DB, separate DB).',
    'Tenant data isolation. Per-tenant configuration. Trade-off: context propagation complexity.'],
  ['014', 'ML and Intelligence Layers',
    'Modern applications need recommendation, anomaly detection, and feature stores.',
    'Add recommendation, ml-feature-store, and anomaly-detection layers with pluggable model adapters.',
    'ML capabilities integrated into architecture. Trade-off: model lifecycle management complexity.'],
  ['015', 'FinOps and Cost Optimization',
    'Cloud infrastructure needs cost tracking and optimization.',
    'Add cost-optimization layer that tracks resource usage and recommends optimizations.',
    'Cost visibility and optimization recommendations. Trade-off: resource monitoring overhead.'],
];

for (var j = 0; j < topAdrs.length; j++) {
  var adr = topAdrs[j];
  var adrPath = path.join(ADR_DIR, 'ADR-' + adr[0] + '.md');
  if (!fs.existsSync(adrPath)) {
    writeFile(adrPath, generateTopLevelAdr(adr[0], adr[1], adr[2], adr[3], adr[4]));
    docsGenerated++;
  }
}

// Generate ADR index
var indexPath = path.join(ADR_DIR, 'README.md');
writeFile(indexPath, [
  '# Architecture Decision Records',
  '',
  'This directory contains ADRs for major architectural decisions.',
  '',
  '## Index',
  '',
  '| ADR | Title |',
  '|-----|-------|',
].concat(topAdrs.map(function(a) {
  return '| [ADR-' + a[0] + '](ADR-' + a[0] + '.md) | ' + a[1] + ' |';
})).concat([
  '',
  '## How to Write an ADR',
  '',
  '1. Copy the template below',
  '2. Fill in Context, Decision, Consequences',
  '3. Number sequentially (ADR-016, ADR-017, ...)',
  '4. Link to relevant code and layer docs',
  '',
  '## Template',
  '',
  '```markdown',
  '# ADR-XXX: Title',
  '',
  '## Status',
  'Accepted (or Proposed, Deprecated, Superseded)',
  '',
  '## Date',
  'YYYY-MM-DD',
  '',
  '## Context',
  'Why is this decision needed?',
  '',
  '## Decision',
  'What was decided?',
  '',
  '## Consequences',
  'What are the impacts (positive and negative)?',
  '```',
  '',
]).join('\n'));

console.log('Layers processed: ' + layerCount);
console.log('Docs generated: ' + docsGenerated);
console.log('Top-level ADRs: ' + topAdrs.length);
