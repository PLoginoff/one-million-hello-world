# CORS and Threat Detection

## CORS Validation

### CORS Configuration
```typescript
interface CORSConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentialsEnabled: boolean;
  maxAge: number;
  wildcardOrigin: boolean;
}
```

### CORS Policy Validation
```typescript
async validateCORS(request: HttpRequest): Promise<CORSResult> {
  const origin = request.headers.get('origin');
  
  if (!origin) {
    return { allowed: true, preflight: false };
  }
  
  // Check if origin is allowed
  if (!this.isOriginAllowed(origin)) {
    return { allowed: false, error: CORSError.ORIGIN_NOT_ALLOWED };
  }
  
  // Check if preflight request
  if (request.method === HttpMethod.OPTIONS) {
    return this.handlePreflight(request);
  }
  
  return { allowed: true, preflight: false };
}

function isOriginAllowed(origin: string): boolean {
  if (this.config.wildcardOrigin) {
    return true;
  }
  
  return this.config.allowedOrigins.some(allowed => {
    if (allowed === '*') return true;
    return origin === allowed;
  });
}
```

### Preflight Request Handling
```typescript
function handlePreflight(request: HttpRequest): CORSResult {
  const accessControlRequestMethod = request.headers.get('access-control-request-method');
  const accessControlRequestHeaders = request.headers.get('access-control-request-headers');
  
  // Validate method
  if (accessControlRequestMethod && !this.config.allowedMethods.includes(accessControlRequestMethod)) {
    return { allowed: false, error: CORSError.METHOD_NOT_ALLOWED };
  }
  
  // Validate headers
  if (accessControlRequestHeaders) {
    const requestedHeaders = accessControlRequestHeaders.split(',').map(h => h.trim());
    for (const header of requestedHeaders) {
      if (!this.config.allowedHeaders.includes(header)) {
        return { allowed: false, error: CORSError.HEADER_NOT_ALLOWED };
      }
    }
  }
  
  return { allowed: true, preflight: true };
}
```

### CORS Headers Generation
```typescript
function generateCORSHeaders(origin: string): Map<string, string> {
  const headers = new Map<string, string>();
  
  headers.set('Access-Control-Allow-Origin', this.config.wildcardOrigin ? '*' : origin);
  
  if (this.config.credentialsEnabled) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  headers.set('Access-Control-Allow-Methods', this.config.allowedMethods.join(', '));
  headers.set('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
  
  if (this.config.exposedHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', this.config.exposedHeaders.join(', '));
  }
  
  if (this.config.maxAge > 0) {
    headers.set('Access-Control-Max-Age', this.config.maxAge.toString());
  }
  
  return headers;
}
```

## Threat Detection

### Threat Types
```typescript
enum ThreatType {
  XSS,                    // Cross-Site Scripting
  SQL_INJECTION,          // SQL Injection
  CSRF,                   // Cross-Site Request Forgery
  PATH_TRAVERSAL,         // Path Traversal
  DDOS,                   // Distributed Denial of Service
  MALICIOUS_USER_AGENT,   // Malicious User Agent
  COMMAND_INJECTION,      // Command Injection
  LDAP_INJECTION,         // LDAP Injection
  XML_INJECTION,          // XML Injection
  SSRF,                   // Server-Side Request Forgery
  XXE,                    // XML External Entity
  HEADER_INJECTION,       // Header Injection
  PROTOCOL_VIOLATION      // Protocol Violation
}
```

### Threat Pattern
```typescript
interface ThreatPattern {
  type: ThreatType;
  pattern: RegExp | string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}
```

### XSS Detection
```typescript
const XSS_PATTERNS: ThreatPattern[] = [
  {
    type: ThreatType.XSS,
    pattern: /<script[^>]*>.*?<\/script>/gi,
    severity: 'high',
    description: 'Script tag injection detected',
    recommendation: 'Sanitize all user input and use output encoding'
  },
  {
    type: ThreatType.XSS,
    pattern: /javascript:/gi,
    severity: 'high',
    description: 'JavaScript protocol injection detected',
    recommendation: 'Validate and sanitize all URLs'
  },
  {
    type: ThreatType.XSS,
    pattern: /on\w+\s*=/gi,
    severity: 'medium',
    description: 'Event handler injection detected',
    recommendation: 'Avoid inline event handlers'
  }
];

function detectXSS(input: string): ThreatDetectionResult {
  for (const pattern of XSS_PATTERNS) {
    if (pattern.pattern.test(input)) {
      return {
        detected: true,
        type: ThreatType.XSS,
        severity: pattern.severity,
        description: pattern.description,
        recommendation: pattern.recommendation
      };
    }
  }
  
  return { detected: false };
}
```

### SQL Injection Detection
```typescript
const SQL_INJECTION_PATTERNS: ThreatPattern[] = [
  {
    type: ThreatType.SQL_INJECTION,
    pattern: /('|(\-\-)|(;)|(\|)|(\/\*)|(\*\/))/gi,
    severity: 'critical',
    description: 'SQL injection pattern detected',
    recommendation: 'Use parameterized queries'
  },
  {
    type: ThreatType.SQL_INJECTION,
    pattern: /\b(union|select|insert|update|delete|drop|alter|create)\b/gi,
    severity: 'high',
    description: 'SQL keyword detected in input',
    recommendation: 'Use parameterized queries and input validation'
  },
  {
    type: ThreatType.SQL_INJECTION,
    pattern: /\b(or|and)\s+\d+\s*=\s*\d+/gi,
    severity: 'high',
    description: 'SQL tautology detected',
    recommendation: 'Use parameterized queries'
  }
];

function detectSQLInjection(input: string): ThreatDetectionResult {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.pattern.test(input)) {
      return {
        detected: true,
        type: ThreatType.SQL_INJECTION,
        severity: pattern.severity,
        description: pattern.description,
        recommendation: pattern.recommendation
      };
    }
  }
  
  return { detected: false };
}
```

### CSRF Detection
```typescript
function detectCSRF(request: HttpRequest): ThreatDetectionResult {
  const referer = request.headers.get('referer');
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  
  // Check state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    // Check CSRF token
    const csrfToken = request.headers.get('x-csrf-token');
    if (!csrfToken && this.config.requireCSRFToken) {
      return {
        detected: true,
        type: ThreatType.CSRF,
        severity: 'high',
        description: 'CSRF token missing',
        recommendation: 'Implement CSRF token validation'
      };
    }
    
    // Validate referer/origin
    if (referer || origin) {
      const refererOrigin = referer || origin;
      if (!this.isSameOrigin(refererOrigin, host)) {
        return {
          detected: true,
          type: ThreatType.CSRF,
          severity: 'high',
          description: 'Cross-origin request detected',
          recommendation: 'Validate CSRF token for cross-origin requests'
        };
      }
    }
  }
  
  return { detected: false };
}
```

### Path Traversal Detection
```typescript
const PATH_TRAVERSAL_PATTERNS: ThreatPattern[] = [
  {
    type: ThreatType.PATH_TRAVERSAL,
    pattern: /\.\.\//g,
    severity: 'critical',
    description: 'Path traversal pattern detected',
    recommendation: 'Validate and sanitize all file paths'
  },
  {
    type: ThreatType.PATH_TRAVERSAL,
    pattern: /\.\.\\/g,
    severity: 'critical',
    description: 'Windows path traversal detected',
    recommendation: 'Validate and sanitize all file paths'
  },
  {
    type: ThreatType.PATH_TRAVERSAL,
    pattern: /%2e%2e%2f/gi,
    severity: 'critical',
    description: 'URL-encoded path traversal detected',
    recommendation: 'Decode and validate all paths'
  }
];

function detectPathTraversal(input: string): ThreatDetectionResult {
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.pattern.test(input)) {
      return {
        detected: true,
        type: ThreatType.PATH_TRAVERSAL,
        severity: pattern.severity,
        description: pattern.description,
        recommendation: pattern.recommendation
      };
    }
  }
  
  return { detected: false };
}
```

### DDoS Detection
```typescript
class DDoSDetector {
  private requestCounts: Map<string, number> = new Map();
  private timestamps: Map<string, number[]> = new Map();
  
  detect(request: HttpRequest): ThreatDetectionResult {
    const ip = request.remoteAddress;
    const now = Date.now();
    
    // Update request count
    const count = (this.requestCounts.get(ip) || 0) + 1;
    this.requestCounts.set(ip, count);
    
    // Update timestamps
    const timestamps = this.timestamps.get(ip) || [];
    timestamps.push(now);
    this.timestamps.set(ip, timestamps);
    
    // Clean old timestamps (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    const recentTimestamps = timestamps.filter(t => t > oneMinuteAgo);
    this.timestamps.set(ip, recentTimestamps);
    
    // Check rate limit
    if (recentTimestamps.length > this.config.ddosThreshold) {
      return {
        detected: true,
        type: ThreatType.DDOS,
        severity: 'critical',
        description: 'DDoS attack detected',
        recommendation: 'Block IP and implement rate limiting'
      };
    }
    
    return { detected: false };
  }
  
  cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    for (const [ip, timestamps] of this.timestamps) {
      const recentTimestamps = timestamps.filter(t => t > oneHourAgo);
      if (recentTimestamps.length === 0) {
        this.requestCounts.delete(ip);
        this.timestamps.delete(ip);
      } else {
        this.timestamps.set(ip, recentTimestamps);
      }
    }
  }
}
```

### Malicious User Agent Detection
```typescript
const MALICIOUS_USER_AGENTS: string[] = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python/i,
  /perl/i,
  /java/i,
  /go-http-client/i
];

function detectMaliciousUserAgent(userAgent: string): ThreatDetectionResult {
  for (const pattern of MALICIOUS_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      return {
        detected: true,
        type: ThreatType.MALICIOUS_USER_AGENT,
        severity: 'medium',
        description: 'Malicious user agent detected',
        recommendation: 'Implement CAPTCHA or block suspicious user agents'
      };
    }
  }
  
  return { detected: false };
}
```

### Command Injection Detection
```typescript
const COMMAND_INJECTION_PATTERNS: ThreatPattern[] = [
  {
    type: ThreatType.COMMAND_INJECTION,
    pattern: /[;&|`$()]/g,
    severity: 'critical',
    description: 'Command injection pattern detected',
    recommendation: 'Never execute shell commands with user input'
  },
  {
    type: ThreatType.COMMAND_INJECTION,
    pattern: /\b(cat|ls|pwd|whoami|chmod|chown)\b/gi,
    severity: 'high',
    description: 'Unix command detected',
    recommendation: 'Validate and sanitize all input'
  }
];

function detectCommandInjection(input: string): ThreatDetectionResult {
  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.pattern.test(input)) {
      return {
        detected: true,
        type: ThreatType.COMMAND_INJECTION,
        severity: pattern.severity,
        description: pattern.description,
        recommendation: pattern.recommendation
      };
    }
  }
  
  return { detected: false };
}
```

### Comprehensive Threat Detection
```typescript
async detectThreats(request: HttpRequest): Promise<ThreatDetectionResult[]> {
  const threats: ThreatDetectionResult[] = [];
  
  // Detect XSS
  const xssThreat = this.detectXSS(request.uri);
  if (xssThreat.detected) threats.push(xssThreat);
  
  // Detect SQL injection
  const sqlThreat = this.detectSQLInjection(request.uri);
  if (sqlThreat.detected) threats.push(sqlThreat);
  
  // Detect CSRF
  const csrfThreat = this.detectCSRF(request);
  if (csrfThreat.detected) threats.push(csrfThreat);
  
  // Detect path traversal
  const pathThreat = this.detectPathTraversal(request.uri);
  if (pathThreat.detected) threats.push(pathThreat);
  
  // Detect DDoS
  const ddosThreat = this.ddosDetector.detect(request);
  if (ddosThreat.detected) threats.push(ddosThreat);
  
  // Detect malicious user agent
  const userAgent = request.headers.get('user-agent') || '';
  const uaThreat = this.detectMaliciousUserAgent(userAgent);
  if (uaThreat.detected) threats.push(uaThreat);
  
  // Detect command injection
  const cmdThreat = this.detectCommandInjection(request.uri);
  if (cmdThreat.detected) threats.push(cmdThreat);
  
  return threats;
}
```

### Risk Score Calculation
```typescript
function calculateRiskScore(threats: ThreatDetectionResult[]): number {
  let score = 0;
  
  for (const threat of threats) {
    switch (threat.severity) {
      case 'critical':
        score += 100;
        break;
      case 'high':
        score += 75;
        break;
      case 'medium':
        score += 50;
        break;
      case 'low':
        score += 25;
        break;
    }
  }
  
  return Math.min(score, 100);
}
```

### Custom Threat Patterns
```typescript
class ThreatPatternManager {
  private customPatterns: ThreatPattern[] = [];
  
  addPattern(pattern: ThreatPattern): void {
    this.customPatterns.push(pattern);
  }
  
  removePattern(patternId: string): void {
    this.customPatterns = this.customPatterns.filter(p => p.type.toString() !== patternId);
  }
  
  detectWithCustomPatterns(input: string): ThreatDetectionResult[] {
    const results: ThreatDetectionResult[] = [];
    
    for (const pattern of this.customPatterns) {
      if (pattern.pattern instanceof RegExp && pattern.pattern.test(input)) {
        results.push({
          detected: true,
          type: pattern.type,
          severity: pattern.severity,
          description: pattern.description,
          recommendation: pattern.recommendation
        });
      }
    }
    
    return results;
  }
}
```

## Security Best Practices

### CORS Configuration
- Always validate origins in production
- Use specific origins instead of wildcards
- Enable credentials only when necessary
- Set appropriate max-age for preflight caching
- Expose only necessary headers

### Threat Detection
- Use multiple detection methods
- Implement rate limiting
- Monitor threat patterns
- Update threat signatures regularly
- Implement automatic blocking for critical threats
- Log all threat detections for analysis
