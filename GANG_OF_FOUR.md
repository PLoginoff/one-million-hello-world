# The Gang of Four and the Pattern Singularity

> A field study in design patterns, conducted at industrial scale,
> on a workload that prints a greeting.
>
> Русская версия: [GANG_OF_FOUR_ru.md](GANG_OF_FOUR_ru.md)

---

## 1. Who Is the Gang of Four

In 1994, four engineers — Erich Gamma, Richard Helm, Ralph Johnson, and
John Vlissides — published *Design Patterns: Elements of Reusable
Object-Oriented Software*. The book is older than most programming
languages currently in use, its examples are written in C++ and
Smalltalk-80, and its cover features a row of window latches, which
remains the most honest illustration of what a pattern is: the same
solution, dressed differently, again and again.

The book catalogs **23 patterns** in three families:

- **Creational** (5): how to make objects without saying `new` out loud.
- **Structural** (7): how to wrap one thing in another thing.
- **Behavioral** (11): how to make objects talk without coupling them.

For thirty years, this book has been the industry's shared vocabulary —
and, on occasion, its shared delusion: that a problem is solved once it
has been *named*. This project takes the delusion to its logical
conclusion.

---

## 2. The 23 Patterns — All Present, Sir

Every pattern from the book is implemented in this repository. Not as
examples — as *production infrastructure for a greeting*. Here is where
each one lives:

### Creational

| Pattern | Where it lives here |
|---|---|
| **Factory Method** | `factories/` in every one of the 104 layers. `CacheFactory`, `SecurityFactory`, `EventFactory`... |
| **Abstract Factory** | `RateLimitingRedisAdapterFactory.createWithDefaults()` — a factory that manufactures adapters, selected by a factory, configured by a builder. |
| **Builder** | `EventConfigBuilder`, `SerializerBuilder`, `ControllerConfigBuilder` — because constructing a config object in one statement would be reckless. |
| **Prototype** | Entity cloning across domain layers; `HelloWorldMessage` copies itself with versioning intact. |
| **Singleton** | Registries and DI containers. (Uncle Bob disapproves. The registries do not care; they are singletons.) |

### Structural

| Pattern | Where it lives here |
|---|---|
| **Adapter** | `adapters/` everywhere: `InMemoryAdapter`, `RedisAdapter`, `PostgresAdapter`, `ConsulLikeAdapter`, `EtcdLikeAdapter`. The pigeon still fits. |
| **Bridge** | Every `I*Strategy` interface with N independent implementations — abstraction and implementation vary freely, as the book prescribes. |
| **Composite** | Rule composition in `waf` (AND/OR/NOT rule trees), `fraud-detection` (composable rules), `rules-engine` (nested conditions). A rule that contains rules that contain rules. |
| **Decorator** | An entire layer named after it: `LoggingDecorator`, `CachingDecorator`, `TimingDecorator`, `ValidationDecorator`. |
| **Facade** | Also an entire layer. Plus `GitOpsEngine`, `IdentityEngine`, `SecretsEngine` — facades all the way down. |
| **Flyweight** | `data-warehouse` dictionary encoding; `backup` content-addressed block dedup (SHA-256). Shared intrinsic state, as the doctor ordered. |
| **Proxy** | Also an entire layer: virtual, protection, caching, remote, and smart-reference proxies. Five flavors of standing between you and the thing. |

### Behavioral

| Pattern | Where it lives here |
|---|---|
| **Chain of Responsibility** | Middleware pipelines; the `CommandBus` onion — a request passes through handlers until one of them finally admits it is a greeting. |
| **Command** | CQRS command objects with handlers, undo-capable operations in `unit-of-work`. |
| **Interpreter** | Implemented *four separate times*: GraphQL parser, SQL lineage extractor, ICU MessageFormat parser, cron parser. One language per layer; the book said this was fine. |
| **Iterator** | Cursor-based pagination in `read-model` query engine; sorted-set traversal in rate limiting. |
| **Mediator** | `message-bus` — no object talks to another directly; everything shouts into the void and hopes. |
| **Memento** | Snapshots in `event-sourcing`, savepoints in `unit-of-work`, snapshot mementos in `write-model` aggregates. |
| **Observer** | Event bus, `WatchNotifier`, domain event propagation, `observers/` in every domain folder. |
| **State** | So many state machines: failover FSM, outbox FSM, account lifecycle, BPMN tokens, canary controller. Each with explicit states, transitions, and guards — the way the book drew it in 1994. |
| **Strategy** | The project's favorite food. 8 load-balancing strategies, 6 eviction policies, 5 rate-limiting windows, 4 OAuth grants, 3 samplers, and a `strategies/` folder in every layer. |
| **Template Method** | `BaseLogger`, `BaseSerializationError`, base aggregate roots — the skeleton is in the base class, the soul is in the override. |
| **Visitor** | AST walkers in the GraphQL executor and lineage extractor; span-tree traversal in tracing. |

---

## 3. The Math of Pattern Density

The Gang of Four needed 23 patterns to describe reusable object-oriented
software. This project needed:

| Measure | Count |
|---|---|
| Patterns from the book | 23 / 23 ✅ |
| Layers exhibiting each pattern | 104 |
| Approximate pattern instantiations | ~2,000+ |
| Patterns *not* in the book | see below |

The book's patterns turned out to be merely the **starter pack**. This
repository also implements the enterprise patterns the Gang never got
around to, because in 1994 nobody had yet suffered enough:

- **Repository, Unit of Work, Specification** (Fowler, *PoEAA*) — all three, as layers.
- **CQRS, Event Sourcing, Saga, Outbox, Inbox** — five more layers.
- **Circuit Breaker, Retry, Throttling, Feature Flag** — resilience as a lifestyle.
- **Sidecar, Service Mesh, API Gateway** — patterns about patterns about deployment.
- **Anti-Corruption Layer** — a layer whose entire purpose is to apologize for other layers.

When a codebase has more pattern-*shaped* directories than the book has
patterns, the book stops being a reference and becomes a seed. This
repository is what grew.

---

## 4. What the Gang Would Say

Modeled as a finite state machine, with respect:

- **Gamma** (Erich): "The Abstract Factory producing adapter factories
  was not what we meant. But the type safety is impeccable."
- **Helm** (Richard): "You made the *Facade* pattern a layer. The facade
  of the facade layer is... the facade layer."
- **Johnson** (Ralph): "In Smalltalk this would have been one message
  send. But I admit the cron parser is correct."
- **Vlissides** (John): "23 patterns. You have 23 *per layer*. We
  described a vocabulary; you built a dictionary printing press."

The book is 652 pages. This repository is 1,000,000 lines. The ratio of
wisdom to words has, admittedly, changed.

---

## 5. Metrics of Pattern Compliance

| Metric | Value | Commentary |
|---|---|---|
| GoF patterns implemented | 23 / 23 | Complete. Framed. Laminated. |
| Layers | 104 | Each with `strategies/`, `factories/`, `adapters/` |
| Interpreter pattern instances | 4 | Because one parser is a coincidence, four is a policy. |
| State machines | 10+ | All with guards. None with regrets. |
| Singleton count | Uncounted | On purpose. Counting them would require a registry. |
| Lines per pattern | ~34,000 | The most expensive `Strategy` implementation in publishing history. |

---

## 6. An Honest Footnote

Yes — this is the same joke as the Uncle Bob document, and it is still
true: a "Hello World" endpoint does not need an Abstract Factory of
adapters, four interpreters, or a token-based BPMN engine. The gap
between the triviality of the task and the density of the patterns is
the joke.

But the punchline stands on real ground: every pattern listed above is
*genuinely implemented* — real doubly-linked lists in the LRU, real
min-heaps in the scheduler, real parallel-join semantics in BPMN, real
CLDR plural matrices in i18n. If you want to see what "Strategy" or
"Memento" looks like when it is not a diagram in a dusty book but
running, tested TypeScript — it is here, 104 times over.

And the moral is the same as always, the one the Gang of Four itself
would insist on: **patterns are vocabulary, not goals.** The book's own
first chapter warns that patterns increase flexibility at the cost of
complexity, and that the designer must know when to stop. This repository
is a monument to knowing exactly when to stop — and then continuing for
another 700,000 lines, because the endpoint had not yet said hello
*architecturally*.

The latch on the book's cover opens the same window it always did.
Here, it opens into a corridor of 104 doors, each with a factory,
a strategy, and a health check behind it.

---

*This document is itself a pattern: the "Meta-Document" pattern, applied
twice in this repository (see also `UNCLE_BOB.md`). Its implementation
is left as an exercise for the reader.*
