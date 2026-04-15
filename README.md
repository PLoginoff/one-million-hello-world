# One Million Hello World

Этот проект представляет собой полнофункциональную реализацию классического HTTP-сервера, возвращающего "Hello World", с использованием enterprise-grade архитектурных паттернов и best practices.

Кодовая база проекта содержит **1 миллион строк** (пока лишь 50к)

![Progress](https://img.shields.io/badge/progress-3%25-red)

## Цель

Демонстрация комплексной архитектурной реализации с применением принципов чистой архитектуры, SOLID, паттернов проектирования и enterprise-level подходов к разработке. Проект иллюстрирует, как систематический подход к абстракции и модульности может быть применен даже к задачам с минимальной функциональной сложностью, обеспечивая при этом высокую поддерживаемость, тестируемость и расширяемость системы.

## Архитектура

Проект реализован в соответствии с принципами чистой архитектуры, обеспечивая строгую изоляцию бизнес-логики от инфраструктурных зависимостей и следование Dependency Rule. Архитектура построена на основе концентрических слоев с однонаправленным потоком зависимостей, что гарантирует тестируемость, поддерживаемость и масштабируемость системы. Каждый слой решает конкретную задачу и взаимодействует с другими слоями исключительно через четко определенные интерфейсы, реализуя принципы инверсии зависимостей и разделения ответственности.

```
HTTP Request
    ↓
Network Layer (TCP/IP abstraction, socket management)
    ↓
HTTP Parser Layer (Request parsing, headers, body)
    ↓
Security Layer (CORS, Auth, encryption, threat detection)
    ↓
Rate Limiting Layer (IP-based, user-based, API key limits)
    ↓
Validation Layer (Schema validation, sanitization, type checking)
    ↓
Middleware Layer (Logging, Metrics, Tracing, Correlation IDs)
    ↓
Router Layer (Route matching, parameter extraction, wildcards)
    ↓
Controller Layer (Request handling, orchestration, response codes)
    ↓
Service Layer (Business logic, use cases, domain operations)
    ↓
Domain Layer (Core entities, value objects, domain events)
    ↓
Repository Layer (Data access abstraction, query builders)
    ↓
Cache Layer (Multi-level caching, invalidation strategies)
    ↓
Event Layer (Event bus, Pub/Sub, domain event propagation)
    ↓
Message Queue Layer (Async processing, dead letter queues)
    ↓
Data Transformation Layer (Normalization, enrichment, mapping)
    ↓
Serialization Layer (Response serialization, versioning, content negotiation)
    ↓
Compression Layer (Gzip, Brotli, dynamic compression)
    ↓
Circuit Breaker Layer (Fault tolerance, fallback strategies)
    ↓
Retry Layer (Exponential backoff, jitter, idempotency)
    ↓
Saga Layer (Distributed transactions, compensation)
    ↓
Strategy Layer (Execution strategies, A/B testing, feature flags)
    ↓
Facade Layer (Simplified interfaces, aggregation, composition)
    ↓
Proxy Layer (Access control, lazy loading, caching proxy)
    ↓
Decorator Layer (Runtime decoration, cross-cutting concerns)
    ↓
Transport Layer (HTTP response, streaming, chunked encoding)
```

### Логирование

Логи на **каждом уровне**:
- Structured logging (JSON format)
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Correlation IDs для трассировки запросов
- Performance metrics на каждом слое
- Error tracking with stack traces
- Audit logging
- Distributed tracing (OpenTelemetry)

### Технологии

- **TypeScript** с строгой типизацией
- **Express.js** - HTTP framework
- **Winston** - Logging
- **Zod** - Schema validation
- **RxJS** - Reactive streams
- **Inversify** - Dependency Injection
- **OpenTelemetry** - Distributed tracing

## Архитектурные правила и стандарты

### Чистая архитектура (Clean Architecture)

- **Dependency Rule**: зависимости направлены внутрь (внешние слои зависят от внутренних)
- **Entities**: бизнес-логика не зависит от фреймворков, UI, базы данных
- **Use Cases**: бизнес-правила, специфичные для приложения
- **Interface Adapters**: преобразование данных из формата use cases в формат внешних систем
- **Frameworks & Drivers**: внешние инструменты (Express, Winston, etc.)

### SOLID принципы

**S - Single Responsibility Principle:**
- Каждый класс имеет одну причину для изменения
- Каждый слой отвечает за одну функцию
- Каждый файл содержит одну сущность

**O - Open/Closed Principle:**
- Открыт для расширения, закрыт для модификации
- Использование интерфейсов для расширения функционала
- Strategy Pattern для вариативного поведения

**L - Liskov Substitution Principle:**
- Подтипы должны быть заменяемыми базовыми типами
- Контракты интерфейсов строго соблюдаются
- Нарушения логируются как ошибки

**I - Interface Segregation Principle:**
- Много мелких интерфейсов вместо одного большого
- Клиенты не зависят от методов, которые не используют
- Каждый слой имеет свой набор интерфейсов

**D - Dependency Inversion Principle:**
- Модули верхних уровней не зависят от модулей нижних уровней
- Оба зависят от абстракций
- Dependency Injection через Inversify

### Правила слоев

**Строгая изоляция:**
- Слой N может обращаться только к слою N-1
- Запрещены прямые вызовы между непоследовательными слоями
- Обход слоев через паттерн Service Locator запрещен

**Однонаправленный поток:**
- Движение только сверху вниз (Request → Response)
- Нижние слои не знают о верхних
- Event Bus для обратной связи (только через события)

**Интерфейсы между слоями:**
- Каждый слой экспортирует только интерфейсы
- Реализация скрыта внутри слоя
- Типы TypeScript для контрактов

### Тестирование

**Покрытие кода:**
- Минимальное покрытие: **95%**
- Целевое покрытие: **99%+**
- Branch coverage: **90%+**

**Типы тестов:**

1. **Unit Tests** (80% от всех тестов):
   - Тестируют отдельные функции/классы
   - Моки всех зависимостей
   - Изоляция от внешних систем
   - Скорость: < 1ms per test

2. **Integration Tests** (15%):
   - Тестируют взаимодействие слоев
   - In-memory реализации внешних зависимостей
   - Проверка контрактов между слоями
   - Скорость: < 10ms per test

3. **E2E Tests** (5%):
   - Полный путь HTTP Request → Response
   - Реальный HTTP сервер
   - Реальные логи и метрики
   - Скорость: < 100ms per test

**Тестовая пирамида:**
```
        /\
       /E2E\      (5%)
      /------\
     /Integration\ (15%)
    /------------\
   /   Unit Tests  \ (80%)
  /----------------\
```

**Правила написания тестов:**
- AAA pattern (Arrange, Act, Assert)
- Descriptive test names
- One assertion per test
- Independent tests (no shared state)
- Deterministic results
- Mock everything external

**Mutation Testing:**
- Использование Stryker для проверки качества тестов
- Цель: убить 100% мутантов
- Выявление "мертвого" кода в тестах

### Code Style

**TypeScript strict mode:**
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `strictFunctionTypes: true`
- `noImplicitThis: true`

**ESLint + Prettier:**
- Max line length: 120
- Single quotes
- Semicolons required
- No unused variables
- Explicit return types

**Naming conventions:**
- Classes: PascalCase
- Interfaces: PascalCase with I prefix (IUserService)
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Private properties: _prefix
- Files: kebab-case

### Документация

**TSDoc:**
- Каждый публичный метод документирован
- @param для каждого параметра
- @returns для возвращаемых значений
- @throws для исключений
- Примеры использования

**Architecture Decision Records (ADR):**
- Каждое архитектурное решение задокументировано
- Формат: Context, Decision, Consequences
- Хранение в /docs/adr/

### CI/CD

**GitHub Actions:**
- Линтеринг на каждый PR
- Unit tests на каждый PR
- Integration tests на merge
- E2E tests на release
- Coverage report на каждый build

**Quality Gates:**
- Build fails if coverage < 95%
- Build fails if lint errors
- Build fails if test failures
- Mutation testing weekly

## Как запустить

```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start

# С логами
npm run start:dev
```

Сервер будет доступен на `http://localhost:3000`

## API

### GET /

Возвращает классическое "Hello, World!"

## Статистика

- **Строк кода**: 1,000,000 (цель)
- **Файлов**: TBD
- **Слоёв архитектуры**: 25
- **Типов TypeScript**: TBD
- **Размер**: TBD

## Лицензия

MIT
