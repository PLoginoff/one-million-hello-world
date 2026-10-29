# Billing Metering Engine

Real implementation of usage-based billing, in `src/layers/billing/metering/`.

## Architecture

```
UsageEvent ──► UsageMeter (dedup + aggregate) ──► InvoiceBuilder ──► Invoice
                     │                                  ▲
              CreditLedger (FIFO credits) ──────────────┘
                     ▲
   ProrationEngine (mid-cycle changes)
   DunningManager (failed-payment retry ladder)
   BillingCalendar (period math: calendar | anniversary)
   PricingEngine  (flat / tiered / graduated / package)
   BillingEngine  (facade composing all of the above)
```

## Key invariants

- **All money is integer minor units.** No floats cross an API boundary;
  `toMinorUnits` / `fromMinorUnits` are the only converters and use
  banker's rounding.
- **Idempotency.** `UsageMeter.record` dedups on
  `(customerId, idempotencyKey)`; retries are safe no-ops.
- **Periods are UTC.** Billing deliberately ignores customer timezones so
  invoices are deterministic and DST-free.
- **Dunning is a state machine**, not a cron job. `runRetry` is driven by
  an injected `PaymentAttempt` callback and an injectable `Clock`.

## Pricing models

| Model      | Behavior |
|------------|----------|
| `flat`     | `qty × unitPrice` |
| `tiered`   | best bracket's price applies to ALL units |
| `graduated`| marginal: each bracket prices only its units |
| `package`  | `ceil(qty / size) × packagePrice` |

`freeQuantity` on a `Plan` is burned down before pricing runs.

## Anniversary periods

`periodFor(at, { kind: 'anniversary', anchorDay })` clamps the anchor to
the last day of short months (31 → Feb 29/28). Periods therefore vary
28–31 days; `ProrationEngine` always divides by `daysInPeriod`, never 30.

## Proration

Day-granularity, time-weighted: credit the unused fraction of the old
rate, charge the remaining fraction at the new rate. Result is a single
signed `amountCents` — negative means credit owed.

## Dunning

Default ladder: retry at +1d, +3d, +5d, +7d. States:
`none → pending-retry → retrying → pending-retry|exhausted → recovered|written-off`.
`BillingEngine.recordPaymentFailure` also records a debit in the credit
ledger so the customer balance goes negative; a successful retry issues
an offsetting recovery credit.
