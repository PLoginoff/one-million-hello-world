# Onboarding Layer

## Responsibility
User onboarding flows and step tracking

## Position
Product Layer 4

## Components
- **IOnboarding**: Interface defining the layer contract.
- **Onboarding**: Concrete implementation.
- **OnboardingEntity**: Core domain entity.
- **OnboardingValueObject**: Immutable value object.
- **OnboardingDomainService**: Domain logic.
- **OnboardingHealthCheck**: Health check with execution/success/time checks.
- **OnboardingPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **OnboardingError** / **OnboardingErrorMapper**: Error taxonomy and mapping.
