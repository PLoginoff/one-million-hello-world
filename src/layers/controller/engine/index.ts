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

// Streaming primitives (request bodies, SSE, multipart, long-poll, DI).
export * from './streaming-types';

export {
  BoundedChunkStream,
  RequestStreamImpl,
  createRequestStream,
  feedBody,
} from './RequestStreamer';
export type { ChunkStreamOptions, RequestStreamOptions } from './RequestStreamer';

export { MultipartWriter, BoundaryCollisionError } from './MultipartWriter';
export type { MultipartWriterOptions } from './MultipartWriter';

export {
  SseController,
  SseReplayBuffer,
  encodeSseEvent,
  encodeSseFrame,
  sseHeartbeat,
  SSE_CONTENT_TYPE,
} from './SseController';
export type { SseControllerOptions } from './SseController';

export {
  LongPollHub,
  SystemPollScheduler,
  ManualPollScheduler,
} from './LongPoll';
export type { PollScheduler, WaitOptions } from './LongPoll';

export {
  StreamingResponseAssembler,
  MixedModeError,
} from './StreamingResponseAssembler';
export type {
  AssemblerMode,
  AssemblerOptions,
  AssembledResponse,
} from './StreamingResponseAssembler';

export {
  ControllerPipeline,
  PipelineAbort,
  linkHeaderStage,
  envelopeStage,
  problemMappingStage,
} from './ControllerPipeline';
export type {
  PipelineFrame,
  PipelineStage,
  ErrorStage,
  ControllerPipelineOptions,
  PipelineResult,
} from './ControllerPipeline';

export {
  DiContainer,
  ControllerRunner,
  UnregisteredTokenError,
} from './ControllerLifecycle';
export type {
  RegisterOptions,
  CorrelationIdFactory,
  ControllerRunnerOptions,
  ControllerRunResult,
} from './ControllerLifecycle';
