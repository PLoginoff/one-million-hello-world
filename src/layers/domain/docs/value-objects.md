# Value Objects

## Overview
The Domain Layer uses value objects to represent immutable, type-safe domain concepts with equality comparison via value rather than reference.

## Value Object Structure

### Value Object Definition
```typescript
abstract class ValueObject {
  abstract equals(other: ValueObject): boolean;
  abstract hashCode(): string;
}

interface ValueObjectConstructor<T extends ValueObject> {
  new (...args: any[]): T;
}
```

## Equality Comparison

### Value Equality
```typescript
abstract class BaseValueObject extends ValueObject {
  protected readonly props: any;
  
  constructor(props: any) {
    super();
    this.props = Object.freeze(props);
  }
  
  equals(other: ValueObject): boolean {
    if (this === other) return true;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify((other as BaseValueObject).props);
  }
  
  hashCode(): string {
    return JSON.stringify(this.props);
  }
}
```

### Value Object Examples

### Email Value Object
```typescript
class Email extends BaseValueObject {
  constructor(private value: string) {
    super({ value });
    
    if (!this.isValidEmail(value)) {
      throw new InvalidValueError('Invalid email format');
    }
  }
  
  getValue(): string {
    return this.props.value;
  }
  
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
```

### Money Value Object
```typescript
class Money extends BaseValueObject {
  constructor(private amount: number, private currency: string) {
    super({ amount, currency });
    
    if (amount < 0) {
      throw new InvalidValueError('Amount cannot be negative');
    }
    
    if (!this.isValidCurrency(currency)) {
      throw new InvalidValueError('Invalid currency code');
    }
  }
  
  getAmount(): number {
    return this.props.amount;
  }
  
  getCurrency(): string {
    return this.props.currency;
  }
  
  add(other: Money): Money {
    if (this.props.currency !== other.props.currency) {
      throw new CurrencyMismatchError('Cannot add different currencies');
    }
    
    return new Money(this.props.amount + other.props.amount, this.props.currency);
  }
  
  subtract(other: Money): Money {
    if (this.props.currency !== other.props.currency) {
      throw new CurrencyMismatchError('Cannot subtract different currencies');
    }
    
    const result = this.props.amount - other.props.amount;
    if (result < 0) {
      throw new InsufficientFundsError('Insufficient funds');
    }
    
    return new Money(result, this.props.currency);
  }
  
  private isValidCurrency(currency: string): boolean {
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
    return validCurrencies.includes(currency);
  }
}
```

### Percentage Value Object
```typescript
class Percentage extends BaseValueObject {
  constructor(private value: number) {
    super({ value });
    
    if (value < 0 || value > 100) {
      throw new InvalidValueError('Percentage must be between 0 and 100');
    }
  }
  
  getValue(): number {
    return this.props.value;
  }
  
  of(amount: number): number {
    return (this.props.value / 100) * amount;
  }
  
  add(other: Percentage): Percentage {
    const result = this.props.value + other.props.value;
    if (result > 100) {
      throw new InvalidValueError('Percentage cannot exceed 100');
    }
    
    return new Percentage(result);
  }
}
```

### URL Value Object
```typescript
class URL extends BaseValueObject {
  constructor(private value: string) {
    super({ value });
    
    if (!this.isValidURL(value)) {
      throw new InvalidValueError('Invalid URL format');
    }
  }
  
  getValue(): string {
    return this.props.value;
  }
  
  getDomain(): string {
    try {
      const url = new URL(this.props.value);
      return url.hostname;
    } catch {
      return '';
    }
  }
  
  getPath(): string {
    try {
      const url = new URL(this.props.value);
      return url.pathname;
    } catch {
      return '';
    }
  }
  
  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
```

### UUID Value Object
```typescript
class UUID extends BaseValueObject {
  constructor(private value: string) {
    super({ value });
    
    if (!this.isValidUUID(value)) {
      throw new InvalidValueError('Invalid UUID format');
    }
  }
  
  getValue(): string {
    return this.props.value;
  }
  
  static generate(): UUID {
    const value = crypto.randomUUID();
    return new UUID(value);
  }
  
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
```

## Value Object Factory

### Factory Pattern
```typescript
class ValueObjectFactory {
  static createEmail(value: string): Email {
    return new Email(value);
  }
  
  static createMoney(amount: number, currency: string): Money {
    return new Money(amount, currency);
  }
  
  static createPercentage(value: number): Percentage {
    return new Percentage(value);
  }
  
  static createURL(value: string): URL {
    return new URL(value);
  }
  
  static createUUID(value: string): UUID {
    return new UUID(value);
  }
}
```

## Value Object Validation

### Validation Strategy
```typescript
class ValueObjectValidator {
  static validate<T extends ValueObject>(valueObject: T): ValidationResult {
    try {
      // Value objects should throw errors on invalid construction
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [(error as Error).message]
      };
    }
  }
}
```

## Best Practices

### Value Object Design Guidelines
- Make value objects immutable
- Implement proper equality comparison
- Validate values in constructor
- Use descriptive class names
- Keep value objects simple and focused

### Immutability Guidelines
- Freeze properties on construction
- Don't provide setter methods
- Return new instances for modifications
- Use Object.freeze for deep immutability

### Performance Considerations
- Cache hash codes
- Use efficient equality comparison
- Minimize object creation
- Use flyweight pattern for common values
