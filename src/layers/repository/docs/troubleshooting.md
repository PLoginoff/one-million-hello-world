# Troubleshooting

## Common Issues

### High Memory Usage
- Check cache size and eviction policy
- Review data access storage limits
- Monitor transaction memory usage
- Reduce layer statistics collection if needed

### Slow Performance
- Check cache hit rates
- Review filter/sort compilation
- Monitor layer execution times
- Enable/disable layers to identify bottlenecks
- Review middleware execution order

### Transaction Timeouts
- Increase timeout if operations are legitimate
- Check for long-running operations
- Review isolation level (higher levels may block longer)
- Monitor transaction statistics

### Cache Misses
- Review TTL settings
- Check eviction policy
- Monitor access patterns
- Consider cache warming
- Review cache size limits

### Query Parsing Errors
- Check allowed/forbidden fields
- Validate query string format
- Review operator usage
- Check field names and types
- Monitor parse statistics

### Validation Failures
- Review validation rules
- Check validator logic
- Validate input data format
- Monitor validation statistics
- Review error messages

## Debugging Tips
- Enable detailed logging for each layer
- Use layer statistics to identify issues
- Test layers independently
- Use health checks to verify layer status
- Monitor metrics for performance insights
