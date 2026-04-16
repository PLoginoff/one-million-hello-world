# Use Case Pattern

## Overview
The Service Layer uses the Use Case pattern to encapsulate business logic. Each use case represents a specific business operation with defined inputs and outputs.

## Use Case Definition

### Use Case Interface
```typescript
interface UseCase<TInput, TOutput> {
  name: string;
  execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>>;
}
```

### Use Case Implementation
```typescript
abstract class BaseUseCase<TInput, TOutput> implements UseCase<TInput, TOutput> {
  abstract name: string;
  
  abstract execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>>;
  
  protected async executeWithValidation(
    input: TInput,
    context: ServiceContext,
    validator: (input: TInput) => ValidationResult
  ): Promise<ServiceResult<TOutput>> {
    const validation = validator(input);
    
    if (!validation.valid) {
      return ServiceResult.failure({
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: validation.errors
      });
    }
    
    return await this.execute(input, context);
  }
}
```

## Use Case Registry

### Registry Implementation
```typescript
class UseCaseRegistry {
  private useCases: Map<string, UseCase<any, any>> = new Map();
  
  register<TInput, TOutput>(useCase: UseCase<TInput, TOutput>): void {
    this.useCases.set(useCase.name, useCase);
  }
  
  unregister(name: string): void {
    this.useCases.delete(name);
  }
  
  get<TInput, TOutput>(name: string): UseCase<TInput, TOutput> | undefined {
    return this.useCases.get(name);
  }
  
  has(name: string): boolean {
    return this.useCases.has(name);
  }
  
  getAll(): Map<string, UseCase<any, any>> {
    return new Map(this.useCases);
  }
  
  clear(): void {
    this.useCases.clear();
  }
}
```

## Use Case Examples

### Create User Use Case
```typescript
interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

interface CreateUserOutput {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

class CreateUserUseCase extends BaseUseCase<CreateUserInput, CreateUserOutput> {
  name = 'createUser';
  
  constructor(
    private userRepository: UserRepository,
    private passwordHasher: PasswordHasher
  ) {
    super();
  }
  
  async execute(input: CreateUserInput, context: ServiceContext): Promise<ServiceResult<CreateUserOutput>> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      return ServiceResult.failure({
        code: 'USER_EXISTS',
        message: 'User with this email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await this.passwordHasher.hash(input.password);
    
    // Create user
    const user = await this.userRepository.create({
      email: input.email,
      password: hashedPassword,
      name: input.name,
      createdAt: new Date()
    });
    
    // Return output
    return ServiceResult.success({
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    });
  }
}
```

### Get User Use Case
```typescript
interface GetUserInput {
  userId: string;
}

interface GetUserOutput {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

class GetUserUseCase extends BaseUseCase<GetUserInput, GetUserOutput> {
  name = 'getUser';
  
  constructor(private userRepository: UserRepository) {
    super();
  }
  
  async execute(input: GetUserInput, context: ServiceContext): Promise<ServiceResult<GetUserOutput>> {
    const user = await this.userRepository.findById(input.userId);
    
    if (!user) {
      return ServiceResult.failure({
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }
    
    return ServiceResult.success({
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    });
  }
}
```

### Update User Use Case
```typescript
interface UpdateUserInput {
  userId: string;
  name?: string;
  email?: string;
}

interface UpdateUserOutput {
  userId: string;
  email: string;
  name: string;
  updatedAt: Date;
}

class UpdateUserUseCase extends BaseUseCase<UpdateUserInput, UpdateUserOutput> {
  name = 'updateUser';
  
  constructor(private userRepository: UserRepository) {
    super();
  }
  
  async execute(input: UpdateUserInput, context: ServiceContext): Promise<ServiceResult<UpdateUserOutput>> {
    const user = await this.userRepository.findById(input.userId);
    
    if (!user) {
      return ServiceResult.failure({
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }
    
    // Update user
    if (input.name) user.name = input.name;
    if (input.email) user.email = input.email;
    user.updatedAt = new Date();
    
    await this.userRepository.update(user);
    
    return ServiceResult.success({
      userId: user.id,
      email: user.email,
      name: user.name,
      updatedAt: user.updatedAt
    });
  }
}
```

### Delete User Use Case
```typescript
interface DeleteUserInput {
  userId: string;
}

interface DeleteUserOutput {
  userId: string;
  deletedAt: Date;
}

class DeleteUserUseCase extends BaseUseCase<DeleteUserInput, DeleteUserOutput> {
  name = 'deleteUser';
  
  constructor(private userRepository: UserRepository) {
    super();
  }
  
  async execute(input: DeleteUserInput, context: ServiceContext): Promise<ServiceResult<DeleteUserOutput>> {
    const user = await this.userRepository.findById(input.userId);
    
    if (!user) {
      return ServiceResult.failure({
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }
    
    await this.userRepository.delete(input.userId);
    
    return ServiceResult.success({
      userId: input.userId,
      deletedAt: new Date()
    });
  }
}
```

## Use Case Execution

### Use Case Executor
```typescript
class UseCaseExecutor {
  private registry: UseCaseRegistry;
  private cache: Cache;
  private retryStrategy: RetryStrategy;
  
  constructor(
    registry: UseCaseRegistry,
    cache: Cache,
    retryStrategy: RetryStrategy
  ) {
    this.registry = registry;
    this.cache = cache;
    this.retryStrategy = retryStrategy;
  }
  
  async execute<TInput, TOutput>(
    useCaseName: string,
    input: TInput,
    context: ServiceContext
  ): Promise<ServiceResult<TOutput>> {
    const useCase = this.registry.get<TInput, TOutput>(useCaseName);
    
    if (!useCase) {
      return ServiceResult.failure({
        code: 'USE_CASE_NOT_FOUND',
        message: `Use case '${useCaseName}' not found`
      });
    }
    
    // Check cache
    const cacheKey = this.generateCacheKey(useCaseName, input);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached as ServiceResult<TOutput>;
    }
    
    // Execute with retry
    const result = await this.retryStrategy.execute(async () => {
      return await useCase.execute(input, context);
    });
    
    // Cache successful result
    if (result.success && this.shouldCache(useCaseName)) {
      await this.cache.set(cacheKey, result, this.getCacheTTL(useCaseName));
    }
    
    return result;
  }
  
  private generateCacheKey(useCaseName: string, input: TInput): string {
    const inputHash = this.hashInput(input);
    return `${useCaseName}:${inputHash}`;
  }
  
  private hashInput(input: TInput): string {
    return crypto.createHash('md5').update(JSON.stringify(input)).digest('hex');
  }
  
  private shouldCache(useCaseName: string): boolean {
    const cacheableUseCases = ['getUser', 'listUsers'];
    return cacheableUseCases.includes(useCaseName);
  }
  
  private getCacheTTL(useCaseName: string): number {
    const defaultTTL = 300; // 5 minutes
    const ttls: Map<string, number> = new Map([
      ['getUser', 60],
      ['listUsers', 120]
    ]);
    return ttls.get(useCaseName) || defaultTTL;
  }
}
```

## Use Case Composition

### Composite Use Case
```typescript
class CompositeUseCase<TInput, TOutput> extends BaseUseCase<TInput, TOutput> {
  name = 'composite';
  
  constructor(
    private useCases: UseCase<any, any>[],
    private orchestrator: UseCaseOrchestrator
  ) {
    super();
  }
  
  async execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>> {
    return await this.orchestrator.orchestrate(this.useCases, input, context);
  }
}

class UseCaseOrchestrator {
  async orchestrate<TInput, TOutput>(
    useCases: UseCase<any, any>[],
    input: TInput,
    context: ServiceContext
  ): Promise<ServiceResult<TOutput>> {
    let currentInput = input;
    
    for (const useCase of useCases) {
      const result = await useCase.execute(currentInput, context);
      
      if (!result.success) {
        return result as ServiceResult<TOutput>;
      }
      
      currentInput = result.data as any;
    }
    
    return ServiceResult.success(currentInput as TOutput);
  }
}
```

## Best Practices

### Use Case Design Guidelines
- Keep use cases focused and single-purpose
- Use descriptive names for use cases
- Define clear input and output types
- Implement proper error handling
- Validate inputs before processing
- Log important operations

### Use Case Registration Guidelines
- Register use cases at application startup
- Use consistent naming conventions
- Document use case dependencies
- Implement lazy loading when appropriate
- Use dependency injection

### Performance Considerations
- Implement caching for read operations
- Use async operations for I/O-bound tasks
- Implement retry strategies for transient failures
- Use connection pooling for database operations
- Monitor use case execution times
