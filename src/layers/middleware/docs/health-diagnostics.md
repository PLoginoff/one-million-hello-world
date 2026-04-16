# Health Checks and Diagnostics

## Overview
The Middleware Layer provides comprehensive health monitoring and diagnostic capabilities to ensure system reliability and facilitate troubleshooting.

## Health Checks

### Health Status
```typescript
enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}
```

### Health Check Result
```typescript
interface HealthCheckResult {
  status: HealthStatus;
  score: number;
  checks: ComponentHealthCheck[];
  timestamp: Date;
}

interface ComponentHealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  details?: any;
}
```

### Health Checker Implementation
```typescript
class HealthChecker {
  async checkHealth(): Promise<HealthCheckResult> {
    const checks: ComponentHealthCheck[] = [];
    let score = 100;
    
    // Check logging system
    const loggingCheck = await this.checkLogging();
    checks.push(loggingCheck);
    if (loggingCheck.status === 'fail') score -= 25;
    if (loggingCheck.status === 'warn') score -= 10;
    
    // Check metrics system
    const metricsCheck = await this.checkMetrics();
    checks.push(metricsCheck);
    if (metricsCheck.status === 'fail') score -= 25;
    if (metricsCheck.status === 'warn') score -= 10;
    
    // Check tracing system
    const tracingCheck = await this.checkTracing();
    checks.push(tracingCheck);
    if (tracingCheck.status === 'fail') score -= 25;
    if (tracingCheck.status === 'warn') score -= 10;
    
    // Check correlation system
    const correlationCheck = await this.checkCorrelation();
    checks.push(correlationCheck);
    if (correlationCheck.status === 'fail') score -= 25;
    if (correlationCheck.status === 'warn') score -= 10;
    
    // Determine overall status
    let status: HealthStatus;
    if (score >= 90) status = HealthStatus.HEALTHY;
    else if (score >= 70) status = HealthStatus.DEGRADED;
    else status = HealthStatus.UNHEALTHY;
    
    return {
      status,
      score,
      checks,
      timestamp: new Date()
    };
  }
  
  private async checkLogging(): Promise<ComponentHealthCheck> {
    const start = Date.now();
    
    try {
      const logCount = this.logger.getLogCount();
      const duration = Date.now() - start;
      
      if (logCount > this.config.maxLogCount) {
        return {
          name: 'logging',
          status: 'warn',
          message: 'Log count approaching limit',
          duration,
          details: { logCount, maxLogCount: this.config.maxLogCount }
        };
      }
      
      return {
        name: 'logging',
        status: 'pass',
        message: 'Logging system healthy',
        duration,
        details: { logCount }
      };
    } catch (error) {
      return {
        name: 'logging',
        status: 'fail',
        message: 'Logging system error',
        duration: Date.now() - start,
        details: { error }
      };
    }
  }
  
  private async checkMetrics(): Promise<ComponentHealthCheck> {
    const start = Date.now();
    
    try {
      const metricCount = this.metricsCollector.getMetricCount();
      const duration = Date.now() - start;
      
      if (metricCount > this.config.maxMetricCount) {
        return {
          name: 'metrics',
          status: 'warn',
          message: 'Metric count approaching limit',
          duration,
          details: { metricCount, maxMetricCount: this.config.maxMetricCount }
        };
      }
      
      return {
        name: 'metrics',
        status: 'pass',
        message: 'Metrics system healthy',
        duration,
        details: { metricCount }
      };
    } catch (error) {
      return {
        name: 'metrics',
        status: 'fail',
        message: 'Metrics system error',
        duration: Date.now() - start,
        details: { error }
      };
    }
  }
  
  private async checkTracing(): Promise<ComponentHealthCheck> {
    const start = Date.now();
    
    try {
      const activeSpanCount = this.tracer.getActiveSpanCount();
      const duration = Date.now() - start;
      
      if (activeSpanCount > this.config.maxActiveSpans) {
        return {
          name: 'tracing',
          status: 'warn',
          message: 'Active span count high',
          duration,
          details: { activeSpanCount, maxActiveSpans: this.config.maxActiveSpans }
        };
      }
      
      return {
        name: 'tracing',
        status: 'pass',
        message: 'Tracing system healthy',
        duration,
        details: { activeSpanCount }
      };
    } catch (error) {
      return {
        name: 'tracing',
        status: 'fail',
        message: 'Tracing system error',
        duration: Date.now() - start,
        details: { error }
      };
    }
  }
  
  private async checkCorrelation(): Promise<ComponentHealthCheck> {
    const start = Date.now();
    
    try {
      const contextCount = this.correlationManager.getContextCount();
      const duration = Date.now() - start;
      
      if (contextCount > this.config.maxContexts) {
        return {
          name: 'correlation',
          status: 'warn',
          message: 'Correlation context count high',
          duration,
          details: { contextCount, maxContexts: this.config.maxContexts }
        };
      }
      
      return {
        name: 'correlation',
        status: 'pass',
        message: 'Correlation system healthy',
        duration,
        details: { contextCount }
      };
    } catch (error) {
      return {
        name: 'correlation',
        status: 'fail',
        message: 'Correlation system error',
        duration: Date.now() - start,
        details: { error }
      };
    }
  }
}
```

## Diagnostics

### Diagnostic Result
```typescript
interface DiagnosticResult {
  traceId: string;
  overallStatus: 'pass' | 'fail' | 'warn';
  steps: DiagnosticStep[];
  summary: DiagnosticSummary;
  timestamp: Date;
}

interface DiagnosticStep {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  details?: any;
}

interface DiagnosticSummary {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  warnedSteps: number;
}
```

### Diagnostic Runner
```typescript
class DiagnosticRunner {
  async runDiagnostics(): Promise<DiagnosticResult> {
    const traceId = this.traceIdGenerator.generateTraceId();
    const steps: DiagnosticStep[] = [];
    
    // Step 1: Check logging system
    steps.push(await this.diagnoseLogging(traceId));
    
    // Step 2: Check metrics system
    steps.push(await this.diagnoseMetrics(traceId));
    
    // Step 3: Check tracing system
    steps.push(await this.diagnoseTracing(traceId));
    
    // Step 4: Check correlation system
    steps.push(await this.diagnoseCorrelation(traceId));
    
    // Step 5: Check pipeline system
    steps.push(await this.diagnosePipeline(traceId));
    
    // Step 6: Check configuration
    steps.push(await this.diagnoseConfiguration(traceId));
    
    const summary = this.calculateSummary(steps);
    const overallStatus = this.calculateOverallStatus(summary);
    
    return {
      traceId,
      overallStatus,
      steps,
      summary,
      timestamp: new Date()
    };
  }
  
  private async diagnoseLogging(traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const logCount = this.logger.getLogCount();
      const logAggregation = this.logger.aggregateLogs();
      
      return {
        name: 'logging-diagnostic',
        status: 'pass',
        message: 'Logging system operational',
        duration: Date.now() - start,
        details: {
          traceId,
          logCount,
          aggregation: logAggregation
        }
      };
    } catch (error) {
      return {
        name: 'logging-diagnostic',
        status: 'fail',
        message: 'Logging system diagnostic failed',
        duration: Date.now() - start,
        details: { traceId, error }
      };
    }
  }
  
  private async diagnoseMetrics(traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const metricCount = this.metricsCollector.getMetricCount();
      const metricStats = this.metricsCollector.calculateStatistics();
      
      return {
        name: 'metrics-diagnostic',
        status: 'pass',
        message: 'Metrics system operational',
        duration: Date.now() - start,
        details: {
          traceId,
          metricCount,
          statistics: metricStats
        }
      };
    } catch (error) {
      return {
        name: 'metrics-diagnostic',
        status: 'fail',
        message: 'Metrics system diagnostic failed',
        duration: Date.now() - start,
        details: { traceId, error }
      };
    }
  }
  
  private async diagnoseTracing(traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const activeSpans = this.tracer.getActiveSpanCount();
      const spanStoreStats = this.spanStore.getStatistics();
      
      return {
        name: 'tracing-diagnostic',
        status: 'pass',
        message: 'Tracing system operational',
        duration: Date.now() - start,
        details: {
          traceId,
          activeSpans,
          storeStats: spanStoreStats
        }
      };
    } catch (error) {
      return {
        name: 'tracing-diagnostic',
        status: 'fail',
        message: 'Tracing system diagnostic failed',
        duration: Date.now() - start,
        details: { traceId, error }
      };
    }
  }
  
  private async diagnoseCorrelation(traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const contextCount = this.correlationManager.getContextCount();
      const contexts = this.correlationManager.getAllContexts();
      
      return {
        name: 'correlation-diagnostic',
        status: 'pass',
        message: 'Correlation system operational',
        duration: Date.now() - start,
        details: {
          traceId,
          contextCount,
          contexts: contexts.length
        }
      };
    } catch (error) {
      return {
        name: 'correlation-diagnostic',
        status: 'fail',
        message: 'Correlation system diagnostic failed',
        duration: Date.now() - start,
        details: { traceId, error }
      };
    }
  }
  
  private async diagnosePipeline(traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const pipelines = this.pipelineManager.getAllPipelines();
      const pipelineCount = pipelines.length;
      
      let failedPipelines = 0;
      for (const pipeline of pipelines) {
        if (!pipeline.isEnabled()) {
          failedPipelines++;
        }
      }
      
      return {
        name: 'pipeline-diagnostic',
        status: failedPipelines > 0 ? 'warn' : 'pass',
        message: failedPipelines > 0 ? 'Some pipelines disabled' : 'All pipelines operational',
        duration: Date.now() - start,
        details: {
          traceId,
          pipelineCount,
          disabledPipelines: failedPipelines
        }
      };
    } catch (error) {
      return {
        name: 'pipeline-diagnostic',
        status: 'fail',
        message: 'Pipeline diagnostic failed',
        duration: Date.now() - start,
        details: { traceId, error }
      };
    }
  }
  
  private async diagnoseConfiguration(traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const config = this.middlewareManager.getConfig();
      const validation = this.configValidator.validate(config);
      
      return {
        name: 'configuration-diagnostic',
        status: validation.valid ? 'pass' : 'fail',
        message: validation.valid ? 'Configuration valid' : 'Configuration invalid',
        duration: Date.now() - start,
        details: {
          traceId,
          configuration: config,
          validation
        }
      };
    } catch (error) {
      return {
        name: 'configuration-diagnostic',
        status: 'fail',
        message: 'Configuration diagnostic failed',
        duration: Date.now() - start,
        details: { traceId, error }
      };
    }
  }
  
  private calculateSummary(steps: DiagnosticStep[]): DiagnosticSummary {
    const totalSteps = steps.length;
    const passedSteps = steps.filter(s => s.status === 'pass').length;
    const failedSteps = steps.filter(s => s.status === 'fail').length;
    const warnedSteps = steps.filter(s => s.status === 'warn').length;
    
    return {
      totalSteps,
      passedSteps,
      failedSteps,
      warnedSteps
    };
  }
  
  private calculateOverallStatus(summary: DiagnosticSummary): 'pass' | 'fail' | 'warn' {
    if (summary.failedSteps > 0) return 'fail';
    if (summary.warnedSteps > 0) return 'warn';
    return 'pass';
  }
}
```

## Statistics Tracking

### Middleware Statistics
```typescript
interface MiddlewareStatistics {
  totalLogs: number;
  totalMetrics: number;
  totalSpans: number;
  uptime: number;
  startTime: Date;
  lastResetTime: Date;
}

class StatisticsTracker {
  private stats: MiddlewareStatistics;
  
  constructor() {
    this.stats = {
      totalLogs: 0,
      totalMetrics: 0,
      totalSpans: 0,
      uptime: 0,
      startTime: new Date(),
      lastResetTime: new Date()
    };
  }
  
  recordLog(): void {
    this.stats.totalLogs++;
  }
  
  recordMetric(): void {
    this.stats.totalMetrics++;
  }
  
  recordSpan(): void {
    this.stats.totalSpans++;
  }
  
  updateUptime(): void {
    this.stats.uptime = Date.now() - this.stats.startTime.getTime();
  }
  
  getStatistics(): MiddlewareStatistics {
    this.updateUptime();
    return { ...this.stats };
  }
  
  resetStatistics(): void {
    this.stats = {
      totalLogs: 0,
      totalMetrics: 0,
      totalSpans: 0,
      uptime: 0,
      startTime: new Date(),
      lastResetTime: new Date()
    };
  }
}
```

## Best Practices

### Health Check Guidelines
- Run health checks at regular intervals
- Set appropriate thresholds for warnings
- Implement component-level health checks
- Monitor health trends over time
- Alert on health status changes
- Provide detailed health information

### Diagnostic Guidelines
- Use unique trace IDs for diagnostic runs
- Provide step-by-step diagnostic information
- Include timing information for each step
- Log diagnostic results for analysis
- Implement diagnostic data retention policies
- Run diagnostics on schedule

### Statistics Guidelines
- Track key metrics for each component
- Update statistics in real-time
- Provide statistics reset capability
- Monitor statistics trends over time
- Export statistics for external analysis
