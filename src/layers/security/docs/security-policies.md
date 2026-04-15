# Security Policies

## Overview
The Security Layer implements configurable security policies that can be updated at runtime. Policies control various aspects of security including authentication requirements, rate limiting, IP filtering, and content validation.

## Policy Configuration

### Security Policy
```typescript
interface SecurityPolicy {
  authentication: AuthenticationPolicy;
  authorization: AuthorizationPolicy;
  cors: CORSConfig;
  rateLimiting: RateLimitingConfig;
  ipFiltering: IPFilteringConfig;
  userAgentFiltering: UserAgentFilteringConfig;
  contentValidation: ContentValidationConfig;
  signatureValidation: SignatureValidationConfig;
  timestampValidation: TimestampValidationConfig;
  nonceValidation: NonceValidationConfig;
}
```

### Authentication Policy
```typescript
interface AuthenticationPolicy {
  required: boolean;
  allowedMethods: AuthenticationMethod[];
  tokenValidation: TokenValidationConfig;
  sessionConfig: SessionConfig;
  maxFailedAttempts: number;
  lockoutDuration: number;
  passwordPolicy: PasswordPolicy;
}

interface TokenValidationConfig {
  issuer: string;
  audience: string;
  algorithm: string;
  secret: string;
  clockSkewTolerance: number;
}

interface SessionConfig {
  maxAge: number;
  absoluteTimeout: number;
  idleTimeout: number;
  refreshTokenEnabled: boolean;
  refreshTokenMaxAge: number;
}

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;
  historyCount: number;
}
```

### Authorization Policy
```typescript
interface AuthorizationPolicy {
  defaultDeny: boolean;
  roleHierarchyEnabled: boolean;
  permissionCachingEnabled: boolean;
  cacheTTL: number;
  auditAuthorization: boolean;
}
```

### Rate Limiting Configuration
```typescript
interface RateLimitingConfig {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  burstProtectionEnabled: boolean;
  burstLimit: number;
  burstWindowMs: number;
}

class RateLimiter {
  private requestCounts: Map<string, number[]> = new Map();
  
  async checkLimit(ip: string): Promise<RateLimitResult> {
    const now = Date.now();
    const requests = this.requestCounts.get(ip) || [];
    
    // Remove old requests outside the window
    const windowStart = now - this.config.windowMs;
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (recentRequests.length >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(recentRequests[0] + this.config.windowMs)
      };
    }
    
    // Add current request
    recentRequests.push(now);
    this.requestCounts.set(ip, recentRequests);
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - recentRequests.length,
      resetTime: new Date(recentRequests[0] + this.config.windowMs)
    };
  }
}
```

### IP Filtering Configuration
```typescript
interface IPFilteringConfig {
  enabled: boolean;
  whitelist: string[];
  blacklist: string[];
  filterPrivateIPs: boolean;
  detectTorExitNodes: boolean;
  detectVPNs: boolean;
  geolocationEnabled: boolean;
  allowedCountries: string[];
  blockedCountries: string[];
}

class IPFilter {
  private privateIPRanges: string[] = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.0/8'
  ];
  
  isPrivateIP(ip: string): boolean {
    return this.privateIPRanges.some(range => 
      this.ipInCIDR(ip, range)
    );
  }
  
  async isTorExitNode(ip: string): Promise<boolean> {
    // Check against Tor exit node list
    return this.torDatabase.contains(ip);
  }
  
  async isVPN(ip: string): Promise<boolean> {
    // Check against VPN database
    return this.vpnDatabase.contains(ip);
  }
  
  async getGeolocation(ip: string): Promise<Geolocation> {
    return this.geolocationService.lookup(ip);
  }
  
  filter(ip: string): IPFilterResult {
    // Check blacklist
    if (this.config.blacklist.some(range => this.ipInCIDR(ip, range))) {
      return { allowed: false, reason: 'IP blacklisted' };
    }
    
    // Check whitelist
    if (this.config.whitelist.length > 0) {
      if (!this.config.whitelist.some(range => this.ipInCIDR(ip, range))) {
        return { allowed: false, reason: 'IP not whitelisted' };
      }
    }
    
    // Filter private IPs
    if (this.config.filterPrivateIPs && this.isPrivateIP(ip)) {
      return { allowed: false, reason: 'Private IP blocked' };
    }
    
    // Filter Tor exit nodes
    if (this.config.detectTorExitNodes && this.isTorExitNode(ip)) {
      return { allowed: false, reason: 'Tor exit node blocked' };
    }
    
    // Filter VPNs
    if (this.config.detectVPNs && this.isVPN(ip)) {
      return { allowed: false, reason: 'VPN blocked' };
    }
    
    // Filter by geolocation
    if (this.config.geolocationEnabled) {
      const geo = this.getGeolocation(ip);
      if (this.config.blockedCountries.includes(geo.countryCode)) {
        return { allowed: false, reason: 'Country blocked' };
      }
      
      if (this.config.allowedCountries.length > 0 && 
          !this.config.allowedCountries.includes(geo.countryCode)) {
        return { allowed: false, reason: 'Country not allowed' };
      }
    }
    
    return { allowed: true };
  }
}
```

### User Agent Filtering Configuration
```typescript
interface UserAgentFilteringConfig {
  enabled: boolean;
  blockedPatterns: string[];
  allowedPatterns: string[];
  required: boolean;
  validateAgainstDatabase: boolean;
}

class UserAgentFilter {
  filter(userAgent: string): UserAgentFilterResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }
    
    // Check required user agent
    if (this.config.required && !userAgent) {
      return { allowed: false, reason: 'User agent required' };
    }
    
    // Check blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(userAgent)) {
        return { allowed: false, reason: 'User agent blocked' };
      }
    }
    
    // Check allowed patterns
    if (this.config.allowedPatterns.length > 0) {
      let allowed = false;
      for (const pattern of this.config.allowedPatterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(userAgent)) {
          allowed = true;
          break;
        }
      }
      
      if (!allowed) {
        return { allowed: false, reason: 'User agent not allowed' };
      }
    }
    
    // Validate against database
    if (this.config.validateAgainstDatabase) {
      const isMalicious = this.userAgentDatabase.isMalicious(userAgent);
      if (isMalicious) {
        return { allowed: false, reason: 'Malicious user agent' };
      }
    }
    
    return { allowed: true };
  }
}
```

### Content Validation Configuration
```typescript
interface ContentValidationConfig {
  maxRequestSize: number;
  maxHeaderSize: number;
  maxHeaderValueSize: number;
  maxHeadersCount: number;
  maxBodySize: number;
  allowedContentTypes: string[];
  blockedContentTypes: string[];
  validateBody: boolean;
}

class ContentValidator {
  validateRequest(request: HttpRequest): ValidationResult {
    const errors: string[] = [];
    
    // Validate request size
    const requestSize = this.calculateRequestSize(request);
    if (requestSize > this.config.maxRequestSize) {
      errors.push('Request size exceeds limit');
    }
    
    // Validate headers
    if (request.headers.size > this.config.maxHeadersCount) {
      errors.push('Too many headers');
    }
    
    for (const [name, value] of request.headers) {
      if (name.length > this.config.maxHeaderSize) {
        errors.push(`Header name too long: ${name}`);
      }
      
      if (value.length > this.config.maxHeaderValueSize) {
        errors.push(`Header value too long: ${name}`);
      }
    }
    
    // Validate body size
    if (request.body.length > this.config.maxBodySize) {
      errors.push('Body size exceeds limit');
    }
    
    // Validate content type
    const contentType = request.headers.get('content-type');
    if (contentType) {
      const mimeType = this.parseMimeType(contentType);
      
      if (this.config.blockedContentTypes.includes(mimeType)) {
        errors.push(`Content type blocked: ${mimeType}`);
      }
      
      if (this.config.allowedContentTypes.length > 0 && 
          !this.config.allowedContentTypes.includes(mimeType)) {
        errors.push(`Content type not allowed: ${mimeType}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### Signature Validation Configuration
```typescript
interface SignatureValidationConfig {
  enabled: boolean;
  algorithm: SignatureAlgorithm;
  headerName: string;
  secret: string;
  publicKey?: string;
}

class SignatureValidator {
  validate(request: HttpRequest): SignatureValidationResult {
    if (!this.config.enabled) {
      return { valid: true };
    }
    
    const signatureHeader = request.headers.get(this.config.headerName);
    if (!signatureHeader) {
      return { valid: false, reason: 'Signature header missing' };
    }
    
    // Extract signature components
    const components = this.parseSignatureHeader(signatureHeader);
    
    // Recompute signature
    const expectedSignature = this.computeSignature(request, components);
    
    // Compare signatures
    if (!this.compareSignatures(components.signature, expectedSignature)) {
      return { valid: false, reason: 'Invalid signature' };
    }
    
    return { valid: true };
  }
  
  private computeSignature(request: HttpRequest, components: any): string {
    const data = this.buildSigningData(request, components);
    
    switch (this.config.algorithm) {
      case SignatureAlgorithm.HMAC_SHA256:
        return crypto.createHmac('sha256', this.config.secret)
          .update(data)
          .digest('hex');
      
      case SignatureAlgorithm.HMAC_SHA512:
        return crypto.createHmac('sha512', this.config.secret)
          .update(data)
          .digest('hex');
      
      case SignatureAlgorithm.RSA_SHA256:
        return crypto.createSign('RSA-SHA256')
          .update(data)
          .sign(this.config.publicKey, 'hex');
    }
  }
}
```

### Timestamp Validation Configuration
```typescript
interface TimestampValidationConfig {
  enabled: boolean;
  maxAge: number;
  clockSkewTolerance: number;
  headerName: string;
}

class TimestampValidator {
  validate(request: HttpRequest): TimestampValidationResult {
    if (!this.config.enabled) {
      return { valid: true };
    }
    
    const timestampHeader = request.headers.get(this.config.headerName);
    if (!timestampHeader) {
      return { valid: false, reason: 'Timestamp header missing' };
    }
    
    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      return { valid: false, reason: 'Invalid timestamp' };
    }
    
    const now = Date.now();
    const age = (now - timestamp) / 1000; // Convert to seconds
    
    // Check max age
    if (age > this.config.maxAge) {
      return { valid: false, reason: 'Timestamp too old' };
    }
    
    // Check clock skew
    if (age < -this.config.clockSkewTolerance) {
      return { valid: false, reason: 'Timestamp in future (clock skew)' };
    }
    
    return { valid: true };
  }
}
```

### Nonce Validation Configuration
```typescript
interface NonceValidationConfig {
  enabled: boolean;
  maxAge: number;
  headerName: string;
}

class NonceValidator {
  private usedNonces: Map<string, number> = new Map();
  
  validate(request: HttpRequest): NonceValidationResult {
    if (!this.config.enabled) {
      return { valid: true };
    }
    
    const nonceHeader = request.headers.get(this.config.headerName);
    if (!nonceHeader) {
      return { valid: false, reason: 'Nonce header missing' };
    }
    
    // Check if nonce was already used
    if (this.usedNonces.has(nonceHeader)) {
      return { valid: false, reason: 'Nonce already used' };
    }
    
    // Add nonce to used list
    this.usedNonces.set(nonceHeader, Date.now());
    
    return { valid: true };
  }
  
  cleanup(): void {
    const now = Date.now();
    const maxAgeMs = this.config.maxAge * 1000;
    
    for (const [nonce, timestamp] of this.usedNonces) {
      if (now - timestamp > maxAgeMs) {
        this.usedNonces.delete(nonce);
      }
    }
  }
}
```

## Policy Management

### Runtime Policy Updates
```typescript
class SecurityPolicyManager {
  private policy: SecurityPolicy;
  
  updatePolicy(updates: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    this.auditLogger.logPolicyUpdate(updates);
  }
  
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }
  
  resetPolicy(): void {
    this.policy = this.getDefaultPolicy();
    this.auditLogger.logPolicyReset();
  }
  
  validatePolicy(policy: SecurityPolicy): ValidationResult {
    const errors: string[] = [];
    
    // Validate authentication policy
    if (policy.authentication.required && 
        policy.authentication.allowedMethods.length === 0) {
      errors.push('Authentication required but no methods allowed');
    }
    
    // Validate rate limiting
    if (policy.rateLimiting.enabled && policy.rateLimiting.maxRequests <= 0) {
      errors.push('Rate limiting enabled but max requests is 0');
    }
    
    // Validate content validation
    if (policy.contentValidation.maxBodySize <= 0) {
      errors.push('Max body size must be positive');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### Policy Versioning
```typescript
interface PolicyVersion {
  version: string;
  policy: SecurityPolicy;
  createdAt: Date;
  createdBy: string;
  changeLog: string;
}

class PolicyVersionManager {
  private versions: PolicyVersion[] = [];
  
  saveVersion(policy: SecurityPolicy, changeLog: string, createdBy: string): void {
    const version: PolicyVersion = {
      version: this.generateVersion(),
      policy: JSON.parse(JSON.stringify(policy)),
      createdAt: new Date(),
      createdBy,
      changeLog
    };
    
    this.versions.push(version);
  }
  
  getVersion(version: string): PolicyVersion | undefined {
    return this.versions.find(v => v.version === version);
  }
  
  rollbackToVersion(version: string): SecurityPolicy {
    const versionData = this.getVersion(version);
    if (!versionData) {
      throw new Error('Version not found');
    }
    
    return JSON.parse(JSON.stringify(versionData.policy));
  }
  
  private generateVersion(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `v${timestamp}-${random}`;
  }
}
```

## Best Practices

### Policy Configuration
- Use least privilege principle
- Enable all security features in production
- Regularly review and update policies
- Implement policy versioning for audit trails
- Test policy changes in staging environment
- Monitor policy violations and adjust accordingly

### Rate Limiting
- Set appropriate limits based on expected traffic
- Implement burst protection for legitimate traffic spikes
- Monitor rate limit violations for attack detection
- Consider per-user rate limiting in addition to IP-based
- Implement gradual rate limit increases for trusted users

### IP Filtering
- Maintain up-to-date threat intelligence feeds
- Regularly review whitelist/blacklist
- Use geolocation filtering cautiously
- Consider temporary blocks for suspicious IPs
- Implement IP reputation scoring

### Content Validation
- Set strict size limits to prevent DoS attacks
- Validate all content types
- Implement body validation for complex content types
- Use content security policies for additional protection
- Monitor for unusual content patterns
