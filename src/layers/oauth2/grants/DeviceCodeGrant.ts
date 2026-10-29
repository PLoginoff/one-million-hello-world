/**
 * Device Authorization grant — RFC 8628.
 *
 * Flow:
 *   1. Device calls deviceAuthorization() → gets device_code + user_code.
 *   2. User visits verification_uri, enters user_code, approves.
 *   3. Device polls token() → authorization_pending until approved.
 *   4. Once approved, token() returns the token pair.
 */

import { randomBytes } from 'crypto';
import { ClientRegistry } from '../core/ClientRegistry';
import { TokenStore } from '../core/TokenStore';
import {
  DeviceAuthorization,
  DeviceGrant,
  OAuth2Error,
  parseScope,
  scopeToString,
  TokenResponse,
} from '../core/types';

export interface DeviceAuthorizationRequest {
  client_id: string;
  scope?: string;
}

export interface DeviceTokenRequest {
  grant_type: 'urn:ietf:params:oauth:grant-type:device_code';
  device_code: string;
  client_id: string;
}

export class DeviceCodeGrant {
  private readonly deviceTtlSeconds: number;
  private readonly pollIntervalSeconds: number;
  private readonly verificationUri: string;
  private readonly now: () => number;
  private readonly minPollIntervalMs: number;

  constructor(
    private readonly clients: ClientRegistry,
    private readonly tokens: TokenStore,
    opts: {
      now?: () => number;
      deviceTtlSeconds?: number;
      pollIntervalSeconds?: number;
      verificationUri?: string;
      minPollIntervalMs?: number;
    } = {}
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.deviceTtlSeconds = opts.deviceTtlSeconds ?? 600;
    this.pollIntervalSeconds = opts.pollIntervalSeconds ?? 5;
    this.verificationUri = opts.verificationUri ?? 'https://auth.local/device';
    this.minPollIntervalMs = opts.minPollIntervalMs ?? 1000;
  }

  /**
   * Device authorization endpoint.
   */
  deviceAuthorization(req: DeviceAuthorizationRequest): DeviceAuthorization {
    this.clients.get(req.client_id);
    this.clients.assertGrantAllowed(
      req.client_id,
      'urn:ietf:params:oauth:grant-type:device_code'
    );
    const scopes = parseScope(req.scope);
    this.clients.assertScopesAllowed(req.client_id, scopes);

    const grant: DeviceGrant = {
      deviceCode: `dc-${randomBytes(24).toString('hex')}`,
      userCode: this.generateUserCode(),
      clientId: req.client_id,
      scope: scopes,
      status: 'pending',
      expiresAtMs: this.now() + this.deviceTtlSeconds * 1000,
      intervalSeconds: this.pollIntervalSeconds,
    };
    this.tokens.storeDeviceGrant(grant);

    return {
      device_code: grant.deviceCode,
      user_code: grant.userCode,
      verification_uri: this.verificationUri,
      verification_uri_complete: `${this.verificationUri}?user_code=${encodeURIComponent(
        grant.userCode
      )}`,
      expires_in: this.deviceTtlSeconds,
      interval: this.pollIntervalSeconds,
    };
  }

  /**
   * User-facing approval (verification endpoint). Called when the user
   * enters their code and approves/denies.
   */
  approve(userCode: string, subject: string): boolean {
    const g = this.tokens.findDeviceGrantByUserCode(userCode);
    if (!g || g.status !== 'pending') return false;
    g.status = 'approved';
    g.subject = subject;
    return true;
  }

  /** User-facing denial. */
  deny(userCode: string): boolean {
    const g = this.tokens.findDeviceGrantByUserCode(userCode);
    if (!g || g.status !== 'pending') return false;
    g.status = 'denied';
    return true;
  }

  /**
   * Token endpoint — device polls until the user approves.
   */
  token(req: DeviceTokenRequest): TokenResponse {
    if (req.grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
      throw new OAuth2Error(
        'unsupported_grant_type',
        `Expected device_code grant, got ${req.grant_type}`
      );
    }
    this.clients.get(req.client_id);

    const g = this.tokens.getDeviceGrant(req.device_code);
    if (!g) {
      throw new OAuth2Error('invalid_grant', 'Unknown device_code');
    }
    if (g.clientId !== req.client_id) {
      throw new OAuth2Error('invalid_grant', 'device_code not issued to this client');
    }

    // Rate limit: slow_down if polled faster than the interval.
    const nowMs = this.now();
    if (g.lastPolledAtMs !== undefined && nowMs - g.lastPolledAtMs < this.minPollIntervalMs) {
      g.intervalSeconds = Math.min(g.intervalSeconds + 5, 60);
      throw new OAuth2Error('slow_down', 'Polling too frequently');
    }
    g.lastPolledAtMs = nowMs;

    switch (g.status) {
      case 'pending':
        throw new OAuth2Error('authorization_pending', 'User has not yet authorised');
      case 'denied':
        throw new OAuth2Error('access_denied', 'User denied the request');
      case 'expired':
        throw new OAuth2Error('expired_token', 'device_code expired');
      case 'consumed':
        throw new OAuth2Error('invalid_grant', 'device_code already consumed');
      case 'approved': {
        g.status = 'consumed';
        const client = this.clients.get(req.client_id);
        const at = this.tokens.mintAccessToken({
          clientId: req.client_id,
          subject: g.subject,
          scope: g.scope,
          ttlSeconds: client.accessTokenTtlSeconds,
        });
        let refresh: string | undefined;
        if (
          client.refreshTokenTtlSeconds !== undefined &&
          client.allowedGrantTypes.includes('refresh_token')
        ) {
          refresh = this.tokens.mintRefreshToken({
            clientId: req.client_id,
            subject: g.subject ?? 'device-user',
            scope: g.scope,
            ttlSeconds: client.refreshTokenTtlSeconds,
          }).token;
        }
        const resp: TokenResponse = {
          access_token: at.token,
          token_type: 'Bearer',
          expires_in: client.accessTokenTtlSeconds,
          scope: g.scope.length ? scopeToString(g.scope) : undefined,
        };
        if (refresh) resp.refresh_token = refresh;
        return resp;
      }
    }
  }

  /* ---------------------------------------------------------------- */

  /**
   * User codes are 8-char human-friendly (no ambiguous chars).
   * Format: XXXX-XXXX
   */
  private generateUserCode(): string {
    const alphabet = 'BCDFGHJKLMNPQRSTVWXZ23456789'; // no vowels/0/1
    const bytes = randomBytes(8);
    let s = '';
    for (let i = 0; i < 8; i++) {
      s += alphabet[bytes[i] % alphabet.length];
      if (i === 3) s += '-';
    }
    return s;
  }
}
