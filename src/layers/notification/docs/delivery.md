# Notification Delivery Engine

Real implementation in `src/layers/notification/delivery/`.

## Pipeline

```
NotificationRequest
   → dedup (FNV-1a content hash or explicit dedupKey, sliding window)
   → channel resolution (explicit channel, or fan-out over all channels)
   → preference resolution (channel × topic matrix + quiet hours)
        deny → suppressed | digest → batched | defer → re-queued | allow ↓
   → template render ({{var}} escaped, {{{raw}}}, {{#if}}, {{#each}})
   → channel adapter (email/sms/push/webhook stubs, scripted failures)
   → DeliveryRecord tracking → per-channel backoff retry
   → provider-callback reconciliation (delivered/bounced/orphan)
```

## Key types

- `NotificationRequest` — input (renamed from `Notification` to avoid clash
  with the existing layer class).
- `DeliveryRecord` — state machine `queued → rendered → sent → delivered|bounced|failed`,
  plus `deferred` (retry scheduled), `suppressed`, `digested`.
- `ChannelBackoff` — per-channel `baseMs × factor^attempts`, capped.

## Preferences

Exact `(userId, topic, channel)` beats wildcard `(userId, '*', channel)`,
which beats default `allow`. Quiet hours (`startHour → endHour` UTC,
wrapping midnight) defer non-urgent topics; `security`, `billing-failed`,
`alert` bypass.

## Digests

A `digest` preference rule collects items per `(user, channel, topic)`;
the batch emits when it hits `every` items or on `flushDigests()`. The
summary renders through `digest:<topic>` or the generic `digest` template.

## Retries

`flushRetries()` re-dispatches `deferred` records whose `nextAttemptAt`
elapsed, re-checking preferences first (quiet hours may still apply).
`retryable:false` provider errors fail immediately without scheduling.
