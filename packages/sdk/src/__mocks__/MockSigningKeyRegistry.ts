import type { Address, LocalAccount } from 'viem'
import { getAddress } from 'viem'

import { createSigningAccount } from '@/__mocks__/utils.js'

/**
 * Registry for deterministic mock signing keys.
 * @description Maps an external wallet key to a stable local signing account.
 */
export interface MockSigningKeyRegistry {
  addressFor(keyId: string): Address
  accountFor(keyId: string, reportedAddress?: Address): LocalAccount
}

/**
 * Create a deterministic mock signing-key registry.
 * Key IDs control signing keys; reported addresses may intentionally diverge.
 * @returns Registry helpers for mock addresses and local accounts.
 */
export function createMockSigningKeyRegistry(): MockSigningKeyRegistry {
  const keysById = new Map<string, LocalAccount>()

  function accountKeyFor(keyId: string): LocalAccount {
    const existing = keysById.get(keyId)
    if (existing) return existing
    const key = createSigningAccount()
    keysById.set(keyId, key)
    return key
  }

  return {
    addressFor: (keyId: string): Address => accountKeyFor(keyId).address,
    accountFor: (keyId: string, reportedAddress?: Address): LocalAccount => {
      const key = accountKeyFor(keyId)
      return {
        ...key,
        address: reportedAddress ? getAddress(reportedAddress) : key.address,
      }
    },
  }
}
