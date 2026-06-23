import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import type { Address, LocalAccount } from 'viem'
import { getAddress } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

import { createSigningAccount, getRandomAddress } from '@/__mocks__/utils.js'

/**
 * Mock Privy Client for testing
 * @description Provides a mock implementation of PrivyClient for testing purposes
 */
export class MockPrivyClient {
  constructor(
    public appId: string,
    public appSecret: string,
  ) {}
}

/**
 * Create a mock Privy client cast as PrivyClient type
 * @param appId - Mock app ID
 * @param appSecret - Mock app secret
 * @returns MockPrivyClient cast as PrivyClient
 */
export function createMockPrivyClient(
  appId: string,
  appSecret: string,
): PrivyClient {
  return new MockPrivyClient(appId, appSecret) as unknown as PrivyClient
}

export function createMockPrivyWallet(params?: {
  id?: string
  address?: Address
}): {
  id: string
  address: Address
} {
  const { id, address } = params ?? {}
  return {
    id: id ?? 'mock-wallet-1',
    address: address ?? getRandomAddress(),
  }
}

export function getMockAuthorizationContext(
  privateKey?: string,
): AuthorizationContext {
  return {
    authorization_private_keys: [privateKey ?? generatePrivateKey()],
  }
}

/**
 * Registry that models Privy's `createViemAccount` contract for tests: the
 * signing key is resolved from `walletId`, while the reported `.address` is
 * taken from the caller. A matched `(walletId, address)` pair reconciles; a
 * pair pointing at a different wallet's address is detectably divergent, which
 * is exactly the misconfiguration the reconciliation seam guards against.
 */
export function createPrivyKeyRegistry() {
  const keysByWalletId = new Map<string, LocalAccount>()
  const keyFor = (walletId: string): LocalAccount => {
    const existing = keysByWalletId.get(walletId)
    if (existing) return existing
    const key = createSigningAccount()
    keysByWalletId.set(walletId, key)
    return key
  }
  return {
    /** Address the given walletId's signing key actually controls. */
    addressFor: (walletId: string): Address => keyFor(walletId).address,
    /**
     * Account that signs with `walletId`'s key but reports `reportedAddress`,
     * mirroring `createViemAccount(client, { walletId, address })`.
     */
    accountFor: (walletId: string, reportedAddress: Address): LocalAccount => ({
      ...keyFor(walletId),
      address: getAddress(reportedAddress),
    }),
  }
}
