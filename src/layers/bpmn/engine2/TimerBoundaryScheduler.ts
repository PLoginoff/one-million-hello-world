/**
 * Timer Boundary-Event Scheduler
 *
 * Implements BPMN timer boundary semantics that the base engine leaves
 * to manual polling: when a token sits at an activity with an attached
 * timer boundary event, this scheduler fires the boundary at the right
 * moment — distinguishing interrupting (cancelActivity=true, the
 * activity is abandoned and the token diverts to the boundary flow)
 * from non-interrupting (cancelActivity=false, the activity keeps
 * running AND a new token spawns down the boundary flow).
 *
 * Driving model: {@link arm} is called when a token enters a watched
 * activity; {@link tick} fires every armed timer whose deadline passed.
 * A timer is auto-disarmed when its activity's token leaves the node
 * (the activity completed before the deadline — the common case).
 *
 * Non-interrupting timers can repeat (cycle timers): after firing, a
 * non-interrupting timer re-arms for another `durationMs` until its
 * activity completes — matching BPMN's repeating boundary timer.
 * Interrupting timers fire once and consume.
 *
 * @module BpmnLayer/Engine2
 */

import type { BpmnEngine } from '../engines/BpmnEngine';
import {
  NodeType,
  ProcessDefinition,
  ProcessInstance,
  ProcessNode,
  Token,
  TokenState,
} from '../engines/types';
import { IClock, SystemClock } from './types';

interface ArmedTimer {
  instanceId: string;
  /** The activity node the boundary is attached to. */
  activityId: string;
  /** The boundary TimerEvent node id. */
  boundaryId: string;
  /** Token sitting at the activity. */
  tokenId: string;
  /** Epoch ms when the timer fires. */
  fireAt: number;
  /** cancelActivity semantics from the boundary node. */
  interrupting: boolean;
  /** Whether a non-interrupting timer re-arms after firing. */
  repeat: boolean;
}

export class TimerBoundaryScheduler {
  private readonly _engine: BpmnEngine;
  private readonly _clock: IClock;
  private readonly _armed: ArmedTimer[];
  /** definitionId -> definition, captured at {@link arm} time. */
  private readonly _defs: Map<string, ProcessDefinition>;

  constructor(engine: BpmnEngine, clock: IClock = new SystemClock()) {
    this._engine = engine;
    this._clock = clock;
    this._armed = [];
    this._defs = new Map();
  }

  /** Register a definition the scheduler should resolve timers against. */
  registerDefinition(def: ProcessDefinition): void {
    this._defs.set(def.id, def);
  }

  /**
   * Arm every timer boundary attached to `activityId` for the given
   * instance+token. Call this when the token enters the activity —
   * typically from a TraceListener or a task handler. `def` is
   * registered automatically for later resolution.
   */
  arm(instance: ProcessInstance, token: Token, def: ProcessDefinition, activityId: string): number {
    this._defs.set(def.id, def);
    const boundaries = def.nodes.filter(
      (n) =>
        n.type === NodeType.TimerEvent &&
        n.attachedToRef === activityId &&
        n.timerDurationMs !== undefined
    );
    const now = this._clock.now();
    for (const b of boundaries) {
      this._armed.push({
        instanceId: instance.id,
        activityId,
        boundaryId: b.id,
        tokenId: token.id,
        fireAt: now + (b.timerDurationMs ?? 0),
        interrupting: b.cancelActivity !== false,
        repeat: b.cancelActivity === false,
      });
    }
    return boundaries.length;
  }

  /**
   * Fire all due timers. Returns the ids of boundary events fired.
   * Interrupting: the activity's token diverts to the boundary flow.
   * Non-interrupting: the token stays at the activity AND a fresh
   *   token spawns on the boundary's outgoing flow (repeat timers
   *   re-arm automatically).
   */
  async tick(): Promise<string[]> {
    const now = this._clock.now();
    const fired: string[] = [];
    for (const t of [...this._armed]) {
      if (t.fireAt > now) continue;
      const instance = this._engine.getInstance(t.instanceId);
      if (!instance) {
        this._disarm(t);
        continue;
      }
      const token = instance.tokens.find((x) => x.id === t.tokenId);
      if (!token || token.nodeId !== t.activityId) {
        // Activity already left — boundary timer lapses silently.
        this._disarm(t);
        continue;
      }
      const def = this._defOf(instance);
      const boundary = def.nodes.find((n) => n.id === t.boundaryId);
      if (!boundary) {
        this._disarm(t);
        continue;
      }
      fired.push(t.boundaryId);
      if (t.interrupting) {
        this._fireInterrupting(instance, def, token, boundary);
        this._disarm(t);
      } else {
        await this._fireNonInterrupting(instance, def, token, boundary);
        if (t.repeat) {
          t.fireAt = now + (boundary.timerDurationMs ?? 0);
        } else {
          this._disarm(t);
        }
      }
    }
    return fired;
  }

  /** Currently armed timers (for inspection). */
  armed(): ReadonlyArray<Pick<ArmedTimer, 'activityId' | 'boundaryId' | 'fireAt' | 'interrupting'>> {
    return this._armed.map(({ activityId, boundaryId, fireAt, interrupting }) => ({
      activityId,
      boundaryId,
      fireAt,
      interrupting,
    }));
  }

  // ------------------------------------------------------------------
  // firing
  // ------------------------------------------------------------------

  private _fireInterrupting(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    boundary: ProcessNode
  ): void {
    // Interrupt: consume the activity token and move it to the boundary's
    // outgoing flow target. The activity is abandoned mid-flight.
    const out = def.flows.filter((f) => f.sourceRef === boundary.id);
    if (out.length > 0) {
      token.nodeId = boundary.id;
      token.state = TokenState.Active;
      // Drive via a fresh run — the engine's proceed will carry it onward.
      token.nodeId = out[0]!.targetRef;
    } else {
      token.state = TokenState.Completed;
    }
  }

  private async _fireNonInterrupting(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    boundary: ProcessNode
  ): Promise<void> {
    // Non-interrupting: the activity token keeps waiting at the activity;
    // spawn a NEW token on the boundary's outgoing flow.
    const out = def.flows.filter((f) => f.sourceRef === boundary.id);
    if (out.length === 0) return;
    const spawned: Token = {
      id: `${token.id}-b${Math.floor(this._clock.now())}`,
      nodeId: boundary.id,
      scopeId: token.scopeId,
      parentTokenId: token.id,
      state: TokenState.Active,
      resumeAt: null,
    };
    instance.tokens.push(spawned);
    spawned.nodeId = out[0]!.targetRef;
    // The spawned token is picked up on the engine's next advanceTime tick.
  }

  private _disarm(t: ArmedTimer): void {
    const i = this._armed.indexOf(t);
    if (i >= 0) this._armed.splice(i, 1);
  }

  private _defOf(instance: ProcessInstance): ProcessDefinition {
    const d = this._defs.get(instance.definitionId);
    if (!d) throw new Error(`Definition not registered: ${instance.definitionId}`);
    return d;
  }
}
