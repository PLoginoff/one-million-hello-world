/**
 * Notification engine 2 — public surface.
 *
 * Policy layer over `delivery/`: per-user preference matrix with
 * quiet hours and rate limiting, channel escalation chains, and
 * template inheritance.
 */

export * from './types';
export * from './PolicyMatrix';
export * from './EscalationChain';
export * from './TemplateTree';
export * from './ChannelHealth';
export * from './PreferenceHierarchy';
