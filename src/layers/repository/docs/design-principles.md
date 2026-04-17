# Design Principles

## 1. Single Responsibility Principle
Each layer has exactly one reason to change. Data access only handles storage, cache only handles caching, etc.

## 2. Dependency Inversion Principle
Each layer depends on abstractions (interfaces), not concrete implementations. Upper layers don't depend on lower layer implementations.

## 3. Interface Segregation Principle
Each interface is focused and minimal. Clients depend only on the methods they use.

## 4. Open/Closed Principle
Layers are open for extension (new implementations) but closed for modification (existing interfaces stable).

## 5. Liskov Substitution Principle
Any implementation can be substituted with another without breaking the system.
