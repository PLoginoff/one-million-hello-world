/**
 * Preference Hierarchy — layered user/team/org/global resolution.
 *
 * `PolicyMatrix` resolves a single user's policy; real deployments
 * inherit preferences from layers: an org sets defaults, a team can
 * tighten them, a user can override both. Resolution order:
 *
 *   user ▸ team ▸ org ▸ global-default
 *
 * with two merge rules per layer:
 *   - first-defined wins (the *most specific* layer that has a row for
 *     this (topic, channel) decides it)
 *   - 'deny' at a higher layer can be *re-enabled* below only if the
 *     higher layer marked its row `overridable`
 *
 * @module NotificationLayer/Engine2
 */

import { Channel } from '../delivery/NotificationTypes';
import { ChannelPref } from './types';

export interface PrefRow {
  readonly pref: ChannelPref;
  /** May a lower layer override this row? Default true for 'allow',
   *  false for 'deny' (compliance-style hard blocks). */
  readonly overridable?: boolean;
}

export type PrefLayerName = 'user' | 'team' | 'org' | 'global';

export interface PrefLayers {
  readonly user?: string;
  readonly team?: string;
  readonly org?: string;
}

interface LayerTable {
  /** topic → channel → row. */
  readonly rows: Map<string, Map<Channel, PrefRow>>;
}

export interface ResolvedPref {
  readonly pref: ChannelPref;
  /** Which layer supplied the winning row. */
  readonly source: PrefLayerName;
  /** The layer-key that set it (e.g. 'team:backend'). */
  readonly sourceKey: string;
  /** True when a higher layer's non-overridable deny shadowed this. */
  readonly shadowed: boolean;
}

const LAYER_ORDER: ReadonlyArray<PrefLayerName> = ['user', 'team', 'org', 'global'];

export class PreferenceHierarchy {
  /** layerKey → table. Keys: 'user:u1', 'team:backend', 'org:acme', 'global'. */
  private readonly _layers = new Map<string, LayerTable>();

  set(layerKey: string, topic: string, channel: Channel, row: PrefRow): void {
    let t = this._layers.get(layerKey);
    if (!t) {
      t = { rows: new Map() };
      this._layers.set(layerKey, t);
    }
    let byChannel = t.rows.get(topic);
    if (!byChannel) {
      byChannel = new Map();
      t.rows.set(topic, byChannel);
    }
    byChannel.set(channel, row);
  }

  clear(layerKey: string, topic?: string, channel?: Channel): void {
    const t = this._layers.get(layerKey);
    if (!t) return;
    if (topic === undefined) {
      this._layers.delete(layerKey);
      return;
    }
    const byChannel = t.rows.get(topic);
    if (!byChannel) return;
    if (channel === undefined) t.rows.delete(topic);
    else byChannel.delete(channel);
  }

  /**
   * Resolve the effective preference for (topic, channel) across the
   * user's layer chain. `membership` maps layer names to the concrete
   * keys the user belongs to (e.g. `{ user: 'user:u1', team: 'team:eng' }`).
   *
   * Walk the layers most-specific first: the first layer with a row
   * wins; a non-overridable deny at a higher layer shadows lower rows
   * (reported via `shadowed`).
   */
  resolve(membership: PrefLayers, topic: string, channel: Channel): ResolvedPref {
    // Walk most-specific first. The first row found is the tentative
    // winner — but a *less specific* layer's non-overridable deny is a
    // compliance block that overrides more-specific allows.
    let winner: { pref: ChannelPref; layer: PrefLayerName; key: string } | undefined;
    let block: { layer: PrefLayerName; key: string } | undefined;
    for (const layer of LAYER_ORDER) {
      const key = this._keyFor(layer, membership);
      if (!key) continue;
      const row = this._layers.get(key)?.rows.get(topic)?.get(channel);
      if (!row) continue;
      if (!winner) {
        winner = { pref: row.pref, layer, key };
      }
      // Default overridability is layer-dependent: a deny at org or
      // global level is a compliance block (non-overridable); a deny at
      // user/team level is a default the narrower layer can relax.
      const overridable =
        row.overridable ?? (layer === 'user' || layer === 'team' || row.pref !== 'deny');
      // Only rows at less-specific layers than the winner can block.
      if (row.pref === 'deny' && !overridable && winner.layer !== layer) {
        block = { layer, key };
      }
    }
    if (block && winner && winner.pref !== 'deny') {
      return { pref: 'deny', source: block.layer, sourceKey: block.key, shadowed: true };
    }
    if (winner) {
      return { pref: winner.pref, source: winner.layer, sourceKey: winner.key, shadowed: block !== undefined };
    }
    if (block) {
      return { pref: 'deny', source: block.layer, sourceKey: block.key, shadowed: false };
    }
    return { pref: 'allow', source: 'global', sourceKey: 'default', shadowed: false };
  }

  /** All rows for a topic across a layer key — for admin UIs. */
  rowsFor(layerKey: string, topic: string): Partial<Record<Channel, PrefRow>> {
    const byChannel = this._layers.get(layerKey)?.rows.get(topic);
    if (!byChannel) return {};
    const out: Partial<Record<Channel, PrefRow>> = {};
    for (const [ch, row] of byChannel) out[ch] = row;
    return out;
  }

  private _keyFor(layer: PrefLayerName, m: PrefLayers): string | undefined {
    switch (layer) {
      case 'user': return m.user ? `user:${m.user}` : undefined;
      case 'team': return m.team ? `team:${m.team}` : undefined;
      case 'org': return m.org ? `org:${m.org}` : undefined;
      case 'global': return 'global';
    }
  }
}
