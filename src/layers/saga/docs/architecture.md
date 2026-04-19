# Saga Layer Architecture

## Status
Accepted (Updated with Multi-Layer Abstraction)

## Context
The Saga Layer is responsible for distributed transactions and compensation. It receives requests from the Retry Layer and provides saga pattern capabilities with multiple abstraction layers for better separation of concerns.

## Decision
We chose to implement the Saga Layer with the following multi-layer architecture:

### Core Interface Layer
1. **ISagaManager**: Main contract for saga operations
2. **ISagaOrchestrator**: Orchestrates saga execution flow
3. **ICompensationOrchestrator**: Orchestrates compensation flow
4. **ISagaValidator**: Validates saga steps before execution

### Execution Layer
5. **IStepExecutor**: Executes individual saga steps
6. **ICompensationStrategy**: Defines compensation behavior
7. **ISagaState**: Manages saga execution state
8. **IErrorHandler**: Handles errors with severity assessment

### Infrastructure Layer
9. **ILogger**: Provides logging capabilities with level filtering

### Implementation Layer
10. **SagaManager**: Main facade using all abstractions
11. **SagaOrchestrator**: Orchestrates execution with dependencies
12. **CompensationOrchestrator**: Orchestrates compensation with strategy
13. **StepExecutor**: Sequential step execution
14. **CompensationStrategy**: Reverse-order compensation
15. **SagaState**: State management with snapshots
16. **ErrorHandler**: Error handling with severity rules
17. **SagaValidator**: Step validation
18. **Logger**: Console-based logging

### Type Definitions Layer
19. **Core Types**: SagaStep, SagaResult, SagaConfig
20. **Extended Types**: SagaExecutionData, SagaMetrics
21. **Enum Types**: SagaStatus, LogLevel, ErrorSeverity
22. **Context Types**: Various context interfaces for each layer

### Key Design Decisions

**Multi-Layer Architecture**
- Separation of concerns across layers
- Each layer has single responsibility
- Dependencies injected via constructor
- Interface-based design for testability

**Saga Pattern**
- Sequential step execution via StepExecutor
- Compensation on failure via CompensationOrchestrator
- Reverse compensation order via CompensationStrategy
- Data tracking per step via SagaState

**Compensation Strategy**
- Automatic compensation on failure
- Configurable compensation toggle
- Compensation error handling with continue-on-error
- Step-by-step rollback with state tracking

**Step Management**
- Named steps for tracking via SagaState
- Execute and compensate functions validated
- Data passing between steps
- Step execution tracking with context

**Error Handling**
- Error propagation via ErrorHandler
- Severity-based error assessment
- Compensation triggered based on severity
- Graceful failure with detailed error messages

**Validation**
- Step name uniqueness validation
- Step function existence validation
- Pre-execution validation via SagaValidator
- Early failure on validation errors

**Logging**
- Level-based logging (DEBUG, INFO, WARN, ERROR)
- Configurable logging toggle
- Context-aware logging
- Performance-friendly with enable/disable

**State Management**
- SagaStatus enum for state tracking
- State snapshots for debugging
- Executed and compensated step tracking
- Error message persistence

**Configuration**
- Logging toggle via OrchestratorConfig
- Compensation toggle via OrchestratorConfig
- Runtime configuration updates
- Configuration propagation to all layers

### Isolation Strategy
- Saga Layer depends only on Retry Layer types
- Does not depend on any higher layers
- Exports only interfaces to Strategy Layer
- Implementation details hidden behind interfaces
- All dependencies are internal to the layer

### Dependency Graph
```
SagaManager
├── SagaOrchestrator
│   ├── StepExecutor
│   ├── CompensationOrchestrator
│   │   ├── CompensationStrategy
│   ├── SagaState
│   └── ErrorHandler
├── SagaValidator
└── Logger
```

## Consequences

### Positive
- Distributed transaction support
- Automatic compensation with strategy pattern
- Step tracking with state management
- Configurable behavior at multiple levels
- Comprehensive error handling with severity
- Validation prevents invalid configurations
- Logging for observability and debugging
- Testable via interface injection
- Extensible with new strategies
- Clean separation of concerns

### Negative
- Increased complexity due to multiple layers
- More files to maintain
- Compensation overhead from orchestration
- State management complexity
- Memory overhead from state tracking
- Execution delay from multiple layers
- Constructor injection complexity

### Alternatives Considered
1. **Use saga library**: Rejected for control and learning purposes
2. **No compensation**: Rejected for data consistency
3. **Parallel execution**: Rejected for simplicity
4. **No step tracking**: Rejected for observability
5. **Single-layer design**: Rejected for maintainability
6. **No validation**: Rejected for robustness
7. **No logging**: Rejected for observability

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- saga-pattern.md - Saga pattern
- compensation-strategy.md - Compensation strategy
- step-management.md - Step management
- error-handling.md - Error handling
- testing.md - Testing strategy
- interfaces/ - All interface definitions
- implementations/ - All concrete implementations
- types/ - Type definitions
