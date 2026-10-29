# Deployment Guide

## Prerequisites

- Docker 20.10+
- Kubernetes 1.24+ (or Docker Compose for local)
- Helm 3.10+ (for Kubernetes deployment)

## Local Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run start:dev

# Run tests
bun test

# Build
bun run build
```

## Docker Deployment

### Build Image
```bash
docker build -t one-million-hello-world:latest .
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  one-million-hello-world:latest
```

### Docker Compose
```bash
docker-compose up -d
```

## Kubernetes Deployment

### Using Helm
```bash
# Add values override
cat > values-prod.yaml <<EOF
replicaCount: 3
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
EOF

# Deploy
helm install one-million-hello-world \
  infrastructure/helm/one-million-hello-world \
  -f values-prod.yaml
```

### Using kubectl
```bash
kubectl apply -f infrastructure/k8s/namespace.yml
kubectl apply -f infrastructure/k8s/deployment.yml
kubectl apply -f infrastructure/k8s/service.yml
kubectl apply -f infrastructure/k8s/ingress.yml
```

## Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Runtime environment |
| PORT | 3000 | HTTP port |
| LOG_LEVEL | info | Logging verbosity |
| RATE_LIMIT_ENABLED | true | Enable rate limiting |
| CACHE_ENABLED | true | Enable caching |
| CORS_ORIGINS | * | Allowed CORS origins |

## Health Checks

```bash
# Liveness probe
curl http://localhost:3000/health

# Readiness probe
curl http://localhost:3000/health?check=readiness

# Metrics
curl http://localhost:3000/metrics
```

## Blue-Green Deployment

1. Deploy new version as "green"
2. Run smoke tests against green
3. Switch traffic from blue to green
4. Monitor for 10 minutes
5. Keep blue as rollback for 1 hour

## Canary Deployment

1. Deploy canary with 10% traffic
2. Monitor error rate and latency for 5 minutes
3. If healthy, increase to 50% then 100%
4. If unhealthy, rollback canary
