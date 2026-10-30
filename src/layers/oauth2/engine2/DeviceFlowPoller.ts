/**
 * DeviceFlowPoller — client-side polling for the device authorization
 * grant (RFC 8628 §3.4-3.5).
 *
 * The grant itself lives in v1 (`grants/DeviceCodeGrant.ts`) and throws
 * `authorization_pending` / `slow_down` on each poll. This poller wraps
 * that with a correct client loop:
 *
 *   - Wait `interval` seconds between polls (from the device
 *     authorization response, default 5s).
 *   - On `slow_down`, RFC 8628 §3.5 requires ADDING 5 seconds to the
 *     interval — implemented as interval += 5 on each slow_down.
 *   - On `authorization_pending`, keep polling.
 *   - On `expired_token` / `access_denied`, stop with the outcome.
 *   - Overall `deadlineMs` bounds the whole loop; `sleep` is injectable
 *     so tests don't wait.
 *
 * @module OAuth2Layer/Engine2
 */

import { DeviceCodeGrant, DeviceTokenRequest } from '../grants/DeviceCodeGrant';
import { DeviceAuthorization, OAuth2Error, TokenResponse } from '../core/types';
import { OAuthClock2, SystemOAuthClock2 } from './types';

export interface DevicePollOptions {
  /** Injectable sleep — default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Hard cap on total polling time. Default 0 = rely on device expiry. */
  deadlineMs?: number;
  /** Extra seconds added per slow_down (RFC 8628 wants 5). Default 5. */
  slowDownStepSec?: number;
  clock?: OAuthClock2;
}

export type DevicePollResult =
  | { readonly status: 'approved'; readonly token: TokenResponse; readonly polls: number }
  | { readonly status: 'denied' }
  | { readonly status: 'expired' }
  | { readonly status: 'timeout' }
  | { readonly status: 'error'; readonly error: OAuth2Error };

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class DeviceFlowPoller {
  private readonly _grant: DeviceCodeGrant;
  private readonly _sleep: (ms: number) => Promise<void>;
  private readonly _deadlineMs: number;
  private readonly _slowStepSec: number;
  private readonly _clock: OAuthClock2;

  constructor(grant: DeviceCodeGrant, opts: DevicePollOptions = {}) {
    this._grant = grant;
    this._sleep = opts.sleep ?? defaultSleep;
    this._deadlineMs = Math.max(0, opts.deadlineMs ?? 0);
    this._slowStepSec = Math.max(1, opts.slowDownStepSec ?? 5);
    this._clock = opts.clock ?? new SystemOAuthClock2();
  }

  /**
   * Poll until approval, denial, expiry, or deadline. Returns the final
   * outcome rather than throwing — polling *is* the flow.
   */
  async poll(
    clientId: string,
    auth: DeviceAuthorization
  ): Promise<DevicePollResult> {
    const req: DeviceTokenRequest = {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: auth.device_code,
      client_id: clientId,
    };

    const startedAt = this._clock.now();
    let intervalSec = auth.interval;
    let polls = 0;

    for (;;) {
      polls++;
      try {
        const token = this._grant.token(req);
        return { status: 'approved', token, polls };
      } catch (err) {
        if (!(err instanceof OAuth2Error)) throw err;
        switch (err.code) {
          case 'authorization_pending':
            break; // keep polling
          case 'slow_down':
            intervalSec += this._slowStepSec; // RFC 8628 §3.5
            break;
          case 'access_denied':
            return { status: 'denied' };
          case 'expired_token':
            return { status: 'expired' };
          default:
            return { status: 'error', error: err };
        }
      }

      if (this._deadlineMs > 0 && this._clock.now() - startedAt >= this._deadlineMs) {
        return { status: 'timeout' };
      }
      await this._sleep(intervalSec * 1000);
    }
  }
}
