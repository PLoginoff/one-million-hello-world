/**
 * Shared test helpers for federation tests.
 */

import { EntityMetadata, NameIdFormat } from '../federation/types';

export function spMeta(entityId: string): EntityMetadata {
  return {
    entityId,
    role: 'sp',
    ssoEndpoints: [{ binding: 'redirect', location: `${entityId}/acs` }],
    sloEndpoints: [{ binding: 'redirect', location: `${entityId}/slo` }],
    signingKeys: [{ kty: 'oct', kid: `${entityId}-k1`, k: 'secret' }],
    nameIdFormats: [NameIdFormat.PERSISTENT],
    attributes: [],
    certificates: [],
  };
}
