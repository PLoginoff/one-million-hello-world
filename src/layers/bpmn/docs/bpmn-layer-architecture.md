# Bpmn Layer Architecture

## Position
Layer 60

## Responsibility
BPMN process execution

## Components
- **IBpmn**: Interface defining the layer contract.
- **Bpmn**: Concrete implementation.
- **BpmnEntity**: Core domain entity.
- **BpmnValueObject**: Immutable value object.
- **BpmnDomainService**: Domain logic.

## Integration
This layer receives input from the previous layer and delegates to the next layer through a well-defined interface.

## Testing
- Unit tests for implementation
- Domain tests for entities and value objects
- Integration tests with adjacent layers (planned)
