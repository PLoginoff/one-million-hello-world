/**
 * Onboarding Types
 */

export interface OnboardingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface OnboardingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface OnboardingResult<T> {
  success: boolean;
  data?: T;
  error?: OnboardingError;
}
