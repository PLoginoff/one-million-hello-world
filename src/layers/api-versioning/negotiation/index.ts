/**
 * API Versioning — public exports.
 */

export { SemVer, SemVerParseError, sortVersions, satisfies } from './SemVer';
export {
  VersionMatrix,
  VersionStatus,
} from './VersionMatrix';
export type { VersionEntry, VersionResolution, VersionLifecycle, VersionClock } from './VersionMatrix';
export {
  HeaderVersionExtractor,
  UrlPathVersionExtractor,
  QueryVersionExtractor,
  MediaTypeVersionExtractor,
  CompositeVersionExtractor,
  normalizeVersionToken,
} from './VersionExtractor';
export type { VersionedRequest, ExtractionResult, VersionExtractor } from './VersionExtractor';
export { deprecationHeaders, betaHeaders, mergeHeaders, httpDate } from './DeprecationHeaders';
export type { DeprecationHeaderSet } from './DeprecationHeaders';
export { VersionRouter } from './VersionRouter';
export type { RoutingDecision, VersionRouterOptions } from './VersionRouter';
export { MigrationGuideRegistry } from './MigrationGuide';
export type { MigrationGuide, MigrationChange, MigrationPath } from './MigrationGuide';
export { SunsetSchedule, VersionCompliance, COMPLIANCE_RULES } from './SunsetSchedule';
export type { UpcomingSunset, ComplianceRule, ComplianceViolation } from './SunsetSchedule';
