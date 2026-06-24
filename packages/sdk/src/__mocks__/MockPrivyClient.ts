import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import type { Address } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

import {
  createMockSigningKeyRegistry,
  type MockSigningKeyRegistry,
} from '@/__mocks__/MockSigningKeyRegistry.js'
import { getRandomAddress } from '@/__mocks__/utils.js'

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

/**
 * Create a Privy wallet whose reported address matches its signing key.
 * @param registry - Mock key registry used by the Privy account factory.
 * @param id - Mock Privy wallet ID.
 * @returns Mock Privy wallet metadata.
 */
export function createMatchedPrivyWallet(
  registry: Pick<MockSigningKeyRegistry, 'addressFor'>,
  id = 'mock-wallet-1',
): {
  id: string
  address: Address
} {
  return createMockPrivyWallet({
    id,
    address: registry.addressFor(id),
  })
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
export function createPrivyKeyRegistry(): MockSigningKeyRegistry {
  const registry = createMockSigningKeyRegistry()
  return {
    /** Address the given walletId's signing key actually controls. */
    addressFor: registry.addressFor,
    /**
     * Account that signs with `walletId`'s key but reports `reportedAddress`,
     * mirroring `createViemAccount(client, { walletId, address })`.
     */
    accountFor: registry.accountFor,
  }
}
