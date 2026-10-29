# Encryption Layer Architecture

## Position
Layer 38. Responsibility: encryption at rest and in transit — authenticated symmetric encryption, key derivation, and envelope encryption with key rotation.

## Crypto Core (`crypto/`)
Real implementations over Node `crypto`, no external dependencies:

| Component | What it does |
|-----------|--------------|
| `AesGcm` | AES-256-GCM authenticated encryption. Output `EncryptedEnvelope { v, alg: 'A256GCM', iv, ct, aadHash?, kid? }`; 12-byte IV, 16-byte GCM tag appended to `ct`. Optional AAD and key id |
| `Kdf` | Key derivation: PBKDF2, scrypt, HKDF (all real); argon2id stub with documented parameters delegated to pbkdf2. Enforces minimums — PBKDF2 ≥ 100k iterations, scrypt N ≥ 2^14 |
| `KeyRing` | Envelope encryption: per-record DEK wrapped by a KEK held in the ring. Ciphertext layout `{ wrappedDek, data, kekKid }` — KEK id stored for rotation |
| `FieldEncryptor` | Per-field encryption for records: encrypts values at dot-separated paths (e.g. `user.ssn`) so the rest stays queryable; record PK bound as AAD, tying ciphertext to its row |
| `SecureRandom` | CSPRNG helpers — `bytes`, `hex`, `base64url` |
| `types` | `EncryptedEnvelope`, `EnvelopeKey`, `KdfParams`, `CryptoError` |

## Layer Contract
`IEncryption` (`interfaces/`): `execute(context)`, `configure(config)`, `getStatus()`. `Encryption` (`implementations/`) returns `EncryptionResult` (`{ success, data?, error? }`, code `ENCRYPTION_EXECUTION_ERROR`) and tracks `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Generic Processing Strategies
`default`, `fast`, `reliable`, `cached`, `batch` — all implement `IEncryptionStrategy` (`name`/`priority`/`canHandle`/`execute`), created via `EncryptionStrategyFactory`.

## Domain Model (`domain/`)
Entities (`EncryptionEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`EncryptionExecuted`/`Failed`), handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_ENCRYPTION_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`EncryptionError`, `EncryptionErrorMapper`)
