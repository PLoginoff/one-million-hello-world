/**
 * Controller Engine — public exports.
 *
 * Executable controller core: DTO validation, content negotiation,
 * HATEOAS link building, RFC 7807 problem details, and request-context
 * extraction (pagination/sorting/filtering).
 *
 * @module ControllerLayer/Engine
 */

export * from './types';

export {
  DtoValidator,
  DtoValidationError,
  SchemaError,
  validateDto,
  assertValidSchema,
} from './DtoValidator';

export {
  ResponseBuilder,
  JsonSerializer,
  CsvSerializer,
  PlainTextSerializer,
  NotAcceptableError,
  parseAccept,
  rangeAccepts,
} from './ContentNegotiator';

export {
  LinkBuilder,
  paginationLinks,
  expandTemplate,
  isTemplated,
  urlSegment,
  REL,
} from './HateoasLinkBuilder';

export {
  ProblemDetailsMapper,
  ProblemCategory,
  PROBLEM_TYPES,
} from './ProblemDetailsMapper';

export {
  extractPagination,
  extractSort,
  extractFilters,
  extractRequestContext,
} from './RequestContextExtractor';
export type { QueryParams } from './RequestContextExtractor';
