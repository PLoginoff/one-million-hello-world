/**
 * DR Maturity Scoring
 *
 * Grades the recovery programme on evidence, not intent. Each level
 * asserts strictly more proof than the last:
 *
 *   0 ad-hoc       — no evidence at all.
 *   1 documented   — runbooks exist and have been run (any outcome).
 *   2 exercised    — ≥1 drill or failover with a measured timeline.
 *   3 measured     — measured events AND consistency reports exist;
 *                    RTO/RPO conformance is tracked.
 *   4 proven       — the programme demonstrably meets its objectives:
 *                    ≥3 measured events, ≥80% both-met rate,
 *                    ≥1 consistency report fully consistent,
 *                    ≥1 unhalted runbook.
 *
 * The score is monotone in evidence volume — you cannot reach level 4
 * on a single lucky drill, which is the property that separates a
 * real DR programme from a slide deck.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { MaturityInput, MaturityLevel, MaturityScore } from './types';

const LEVEL_NAMES = ['ad-hoc', 'documented', 'exercised', 'measured', 'proven'] as const;

export function score(input: MaturityInput): MaturityScore {
  const events = input.objectives.length;
  const reports = input.consistency.length;
  const runs = input.runbooks.length;
  const evidenceCount = events + reports + runs;

  const objectivePassRate =
    events === 0 ? 0 : input.objectives.filter((r) => r.rtoMet && r.rpoMet).length / events;
  const consistencyRate =
    reports === 0 ? 0 : input.consistency.filter((r) => r.consistent).length / reports;
  const runbookPassRate =
    runs === 0 ? 0 : input.runbooks.filter((r) => !r.halted).length / runs;

  let level: MaturityLevel = 0;
  let nextLevelNeeds = 'run a recovery runbook once to reach level 1';

  if (runs > 0) {
    level = 1;
    nextLevelNeeds = 'complete a failover drill with a measured timeline';
  }
  if (level >= 1 && events > 0) {
    level = 2;
    nextLevelNeeds = 'verify replica consistency at least once';
  }
  if (level >= 2 && reports > 0) {
    level = 3;
    nextLevelNeeds =
      'hold ≥3 events at ≥80% both-met with consistent replication and a clean runbook';
  }
  if (
    level >= 3 &&
    events >= 3 &&
    objectivePassRate >= 0.8 &&
    consistencyRate >= 1 &&
    runbookPassRate >= 1
  ) {
    level = 4;
    nextLevelNeeds = 'programme proven — keep drilling to hold it';
  }

  return {
    level,
    levelName: LEVEL_NAMES[level],
    detail: { objectivePassRate, consistencyRate, runbookPassRate, evidenceCount },
    nextLevelNeeds,
  };
}
