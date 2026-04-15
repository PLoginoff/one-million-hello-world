# Authentication and Authorization

## Overview
The Security Layer implements comprehensive authentication and authorization mechanisms to ensure secure access to system resources. Multiple authentication methods are supported with flexible authorization models.

## Authentication

### Authentication Methods
```typescript
enum AuthenticationMethod {
  BEARER_TOKEN,
  API_KEY,
  BASIC_AUTH,
  JWT,
  OAUTH2,
  SESSION_COOKIE,
  SIGNATURE,
  NONE
}
```

### Bearer Token Authentication
```typescript
interface BearerTokenAuth {
  method: AuthenticationMethod.BEARER_TOKEN;
  token: string;
  issuer?: string;
  audience?: string;
}

async authenticateBearerToken(header: string): Promise<AuthenticationResult> {
  const token = header.replace('Bearer ', '');
  
  // Validate token format
  if (!this.isValidTokenFormat(token)) {
    return { success: false, error: AuthError.INVALID_TOKEN_FORMAT };
  }
  
  // Verify token signature
  const verification = await this.verifyToken(token);
  if (!verification.valid) {
    return { success: false, error: AuthError.INVALID_TOKEN };
  }
  
  // Extract claims
  const claims = this.extractClaims(token);
  
  return {
    success: true,
    context: this.createSecurityContext(claims)
  };
}
```

### API Key Authentication
```typescript
interface ApiKeyAuth {
  method: AuthenticationMethod.API_KEY;
  apiKey: string;
  keyId?: string;
}

async authenticateApiKey(header: string): Promise<AuthenticationResult> {
  const apiKey = header.replace('ApiKey ', '');
  
  // Validate API key format
  if (!this.isValidApiKeyFormat(apiKey)) {
    return { success: false, error: AuthError.INVALID_API_KEY };
  }
  
  // Lookup API key in database
  const keyRecord = await this.apiKeyService.lookup(apiKey);
  if (!keyRecord) {
    return { success: false, error: AuthError.API_KEY_NOT_FOUND };
  }
  
  // Check if key is active
  if (!keyRecord.isActive) {
    return { success: false, error: AuthError.API_KEY_INACTIVE };
  }
  
  // Check expiration
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return { success: false, error: AuthError.API_KEY_EXPIRED };
  }
  
  return {
    success: true,
    context: this.createSecurityContext(keyRecord)
  };
}
```

### Basic Authentication
```typescript
interface BasicAuth {
  method: AuthenticationMethod.BASIC_AUTH;
  username: string;
  password: string;
}

async authenticateBasicAuth(header: string): Promise<AuthenticationResult> {
  const encoded = header.replace('Basic ', '');
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [username, password] = decoded.split(':');
  
  // Validate credentials
  const isValid = await this.authService.validateCredentials(username, password);
  if (!isValid) {
    return { success: false, error: AuthError.INVALID_CREDENTIALS };
  }
  
  const user = await this.userService.findByUsername(username);
  
  return {
    success: true,
    context: this.createSecurityContext(user)
  };
}
```

### JWT Authentication
```typescript
interface JWTAuth {
  method: AuthenticationMethod.JWT;
  token: string;
  payload: JWTPayload;
}

async authenticateJWT(token: string): Promise<AuthenticationResult> {
  try {
    // Verify JWT signature
    const decoded = await this.jwtService.verify(token);
    
    // Validate required claims
    if (!decoded.sub || !decoded.iss) {
      return { success: false, error: AuthError.INVALID_JWT_CLAIMS };
    }
    
    // Check expiration
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return { success: false, error: AuthError.TOKEN_EXPIRED };
    }
    
    // Check issuer
    if (!this.config.allowedIssuers.includes(decoded.iss)) {
      return { success: false, error: AuthError.INVALID_ISSUER };
    }
    
    return {
      success: true,
      context: this.createSecurityContext(decoded)
    };
  } catch (error) {
    return { success: false, error: AuthError.JWT_VERIFICATION_FAILED };
  }
}
```

### OAuth2 Authentication
```typescript
interface OAuth2Auth {
  method: AuthenticationMethod.OAUTH2;
  accessToken: string;
  tokenType: string;
  scope?: string;
}

async authenticateOAuth2(header: string): Promise<AuthenticationResult> {
  const accessToken = header.replace('Bearer ', '');
  
  // Validate access token with OAuth2 server
  const validation = await this.oauth2Service.validateToken(accessToken);
  if (!validation.valid) {
    return { success: false, error: AuthError.OAUTH2_TOKEN_INVALID };
  }
  
  // Check scope
  if (validation.scope && !this.hasRequiredScope(validation.scope)) {
    return { success: false, error: AuthError.INSUFFICIENT_SCOPE };
  }
  
  return {
    success: true,
    context: this.createSecurityContext(validation)
  };
}
```

### Session Cookie Authentication
```typescript
interface SessionAuth {
  method: AuthenticationMethod.SESSION_COOKIE;
  sessionId: string;
}

async authenticateSessionCookie(cookie: string): Promise<AuthenticationResult> {
  const sessionId = cookie;
  
  // Lookup session in store
  const session = await this.sessionService.get(sessionId);
  if (!session) {
    return { success: false, error: AuthError.SESSION_NOT_FOUND };
  }
  
  // Check if session is active
  if (!session.isActive) {
    return { success: false, error: AuthError.SESSION_INACTIVE };
  }
  
  // Check expiration
  if (session.expiresAt && session.expiresAt < new Date()) {
    return { success: false, error: AuthError.SESSION_EXPIRED };
  }
  
  // Update last activity
  await this.sessionService.updateLastActivity(sessionId);
  
  return {
    success: true,
    context: this.createSecurityContext(session)
  };
}
```

### Signature Authentication
```typescript
interface SignatureAuth {
  method: AuthenticationMethod.SIGNATURE;
  signature: string;
  algorithm: SignatureAlgorithm;
  timestamp: number;
  nonce: string;
}

enum SignatureAlgorithm {
  HMAC_SHA256,
  HMAC_SHA512,
  RSA_SHA256
}

async authenticateSignature(header: string, request: HttpRequest): Promise<AuthenticationResult> {
  const signature = header;
  
  // Extract signature components
  const components = this.parseSignatureHeader(signature);
  
  // Validate timestamp
  if (!this.validateTimestamp(components.timestamp)) {
    return { success: false, error: AuthError.INVALID_TIMESTAMP };
  }
  
  // Validate nonce
  if (!this.validateNonce(components.nonce)) {
    return { success: false, error: AuthError.INVALID_NONCE };
  }
  
  // Recompute signature
  const expectedSignature = this.computeSignature(request, components);
  
  // Compare signatures
  if (!this.compareSignatures(signature, expectedSignature)) {
    return { success: false, error: AuthError.INVALID_SIGNATURE };
  }
  
  // Lookup API key or client
  const credentials = await this.lookupCredentials(components.keyId);
  
  return {
    success: true,
    context: this.createSecurityContext(credentials)
  };
}
```

## Authorization

### Role-Based Access Control (RBAC)
```typescript
interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  inherits?: Role[];
}

interface Permission {
  resource: string;
  action: string;
  conditions?: AuthorizationCondition[];
}

class RBACAuthorizer {
  async authorize(context: SecurityContext, requiredPermission: Permission): Promise<boolean> {
    const userRoles = await this.roleService.getUserRoles(context.userId);
    
    for (const role of userRoles) {
      if (this.hasPermission(role, requiredPermission)) {
        return true;
      }
    }
    
    return false;
  }
  
  private hasPermission(role: Role, required: Permission): boolean {
    for (const permission of role.permissions) {
      if (this.matchesPermission(permission, required)) {
        return true;
      }
    }
    
    // Check inherited roles
    if (role.inherits) {
      for (const inheritedRole of role.inherits) {
        if (this.hasPermission(inheritedRole, required)) {
          return true;
        }
      }
    }
    
    return false;
  }
}
```

### Permission-Based Authorization
```typescript
interface AuthorizationCondition {
  type: 'ip' | 'time' | 'custom';
  evaluate(context: SecurityContext): boolean;
}

async authorizeWithConditions(
  context: SecurityContext,
  permission: Permission
): Promise<boolean> {
  // Check base permission
  if (!await this.rbac.authorize(context, permission)) {
    return false;
  }
  
  // Evaluate conditions
  if (permission.conditions) {
    for (const condition of permission.conditions) {
      if (!condition.evaluate(context)) {
        return false;
      }
    }
  }
  
  return true;
}
```

### Security Context
```typescript
interface SecurityContext {
  userId?: string;
  username?: string;
  roles: string[];
  permissions: Permission[];
  ipAddress: string;
  userAgent: string;
  authenticationMethod: AuthenticationMethod;
  authenticatedAt: Date;
  tokenInfo?: TokenInfo;
  sessionInfo?: SessionInfo;
  metadata: Map<string, any>;
}

interface TokenInfo {
  issuer: string;
  audience: string;
  issuedAt: Date;
  expiresAt: Date;
  scopes: string[];
}

interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}
```

## Anonymous Context

When authentication is not required, an anonymous security context is created:
```typescript
function createAnonymousContext(request: HttpRequest): SecurityContext {
  return {
    roles: ['anonymous'],
    permissions: this.config.anonymousPermissions,
    ipAddress: request.remoteAddress,
    userAgent: request.headers.get('user-agent') || '',
    authenticationMethod: AuthenticationMethod.NONE,
    authenticatedAt: new Date(),
    metadata: new Map()
  };
}
```

## Authentication Flow

### Authentication Pipeline
```typescript
async authenticate(request: HttpRequest): Promise<AuthenticationResult> {
  const startTime = Date.now();
  
  try {
    // Determine authentication method
    const method = this.determineAuthenticationMethod(request);
    
    // Execute authentication
    const result = await this.executeAuthentication(method, request);
    
    // Record metrics
    const duration = Date.now() - startTime;
    this.metrics.recordAuthentication(method, result.success, duration);
    
    // Log event
    this.auditLogger.logAuthentication(method, result, request);
    
    return result;
  } catch (error) {
    this.metrics.recordAuthenticationError(error);
    throw error;
  }
}
```

### Method Detection
```typescript
function determineAuthenticationMethod(request: HttpRequest): AuthenticationMethod {
  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');
  const signatureHeader = request.headers.get(this.config.signatureHeader);
  
  if (authHeader?.startsWith('Bearer ')) {
    return AuthenticationMethod.BEARER_TOKEN;
  }
  
  if (authHeader?.startsWith('ApiKey ')) {
    return AuthenticationMethod.API_KEY;
  }
  
  if (authHeader?.startsWith('Basic ')) {
    return AuthenticationMethod.BASIC_AUTH;
  }
  
  if (cookieHeader) {
    return AuthenticationMethod.SESSION_COOKIE;
  }
  
  if (signatureHeader) {
    return AuthenticationMethod.SIGNATURE;
  }
  
  return AuthenticationMethod.NONE;
}
```

## Security Best Practices

### Token Management
- Use strong cryptographic algorithms for token signing
- Implement token revocation mechanisms
- Set appropriate token expiration times
- Store tokens securely (HttpOnly, Secure flags for cookies)
- Implement token rotation for long-lived sessions

### Credential Storage
- Never store plaintext passwords
- Use strong hashing algorithms (bcrypt, Argon2)
- Implement salt for password hashing
- Use secure credential storage solutions
- Implement credential rotation policies

### Session Management
- Implement session timeout
- Use secure session identifiers
- Implement session fixation protection
- Provide session revocation capability
- Monitor for session anomalies

### Rate Limiting
- Implement authentication rate limiting
- Detect and prevent brute force attacks
- Implement account lockout after failed attempts
- Use CAPTCHA for suspicious activity
- Monitor authentication patterns
