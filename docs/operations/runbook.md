# Operations Runbook

## Common Incidents

### 1. High Error Rate (5xx responses)

**Symptoms:** Alert: error_rate > 5% for 5 minutes

**Investigation:**
1. Check `/health` endpoint for layer status
2. Check `/metrics` for error counters
3. Review application logs for stack traces
4. Identify which layer is failing

**Resolution:**
- If rate limiting layer: increase rate limits temporarily
- If circuit breaker open: wait for reset or check downstream service
- If repository layer: check database connectivity
- If security layer: verify CORS/auth configuration

**Escalation:** On-call engineer if error rate > 10% for 15 minutes

---

### 2. Rate Limiting Triggered

**Symptoms:** Users receiving 429 responses

**Investigation:**
1. Check rate limiting metrics: `rate_limiting_denied_total`
2. Identify affected endpoints via `rate_limiting_by_endpoint`
3. Check if legitimate traffic spike or attack

**Resolution:**
- Legitimate spike: increase rate limits via configuration layer
- Attack: enable bot detection and DDoS protection layers
- Specific user: adjust per-user limits

---

### 3. Cache Miss Rate High

**Symptoms:** `cache_hit_rate < 50%`

**Investigation:**
1. Check cache layer health: `cache_hit_rate`, `cache_miss_rate`
2. Verify cache TTL configuration
3. Check if cache backend is responsive

**Resolution:**
- Increase TTL if data changes infrequently
- Pre-warm cache for hot keys
- Check cache backend connectivity
- Consider cache warming on deployment

---

### 4. Database Connection Issues

**Symptoms:** Repository layer reporting unhealthy

**Investigation:**
1. Check repository health in `/health`
2. Verify database connectivity from application host
3. Check connection pool metrics

**Resolution:**
- Restart application pods if connection pool exhausted
- Check database server status
- Verify network connectivity and firewall rules
- Increase connection pool size if needed

---

### 5. Memory Leak / High Memory Usage

**Symptoms:** Container OOM kills, memory usage > 80%

**Investigation:**
1. Check process memory metrics
2. Review layer metrics for growing data structures
3. Check for unclosed connections or event subscriptions

**Resolution:**
- Restart affected pods
- Check event bus subscriptions (use `clear()` on shutdown)
- Check message queue for unprocessed messages
- Review cache layer for unbounded growth

---

## Deployment

### Pre-deployment Checklist
- [ ] All tests pass: `bun test`
- [ ] Type check passes: `bun run type-check` (tsc --noEmit)
- [ ] Lint passes: `bun run lint`
- [ ] Build succeeds: `bun run build`
- [ ] OpenAPI spec updated if API changes

### Deployment Steps
1. Build Docker image: `docker build -t one-million-hello-world .`
2. Push to registry
3. Deploy via Helm: `helm upgrade one-million-hello-world infrastructure/helm/one-million-hello-world`
4. Verify health: `curl https://api.example.com/health`
5. Check metrics: `curl https://api.example.com/metrics`

### Rollback
1. `helm rollback one-million-hello-world <previous-revision>`
2. Verify health endpoint returns healthy
3. Check error rates return to normal

---

## Monitoring

### Key Metrics to Watch
| Metric | Alert Threshold | Description |
|--------|----------------|-------------|
| http_requests_total | — | Total request count |
| http_error_rate | > 5% | Error rate |
| rate_limiting_denied_total | — | Rate limited requests |
| cache_hit_rate | < 50% | Cache effectiveness |
| circuit_breaker_state | open | Circuit breaker status |
| layer_health_status | unhealthy | Any layer unhealthy |

### Dashboards
- **Overview:** Request rate, error rate, latency, health
- **Layers:** Per-layer execution count, success rate, avg time
- **Infrastructure:** Cache, database, message queue metrics
- **Security:** Auth failures, rate limits, bot detection

---

## On-Call Guide

### Severity Levels
- **SEV1:** System down, all users affected — respond in 5 min
- **SEV2:** Major degradation, many users affected — respond in 15 min
- **SEV3:** Minor degradation, some users affected — respond in 1 hour
- **SEV4:** Cosmetic or non-urgent — respond in 1 business day

### On-Call Checklist
1. Acknowledge alert in monitoring system
2. Check `/health` endpoint
3. Review recent deployments
4. Check metrics dashboard
5. Follow relevant runbook section
6. Communicate status in incident channel
7. Create postmortem for SEV1/SEV2 incidents
