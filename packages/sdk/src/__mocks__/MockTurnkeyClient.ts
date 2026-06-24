import {
  createMockSigningKeyRegistry,
  type MockSigningKeyRegistry,
} from '@/__mocks__/MockSigningKeyRegistry.js'
import type { ChainManager } from '@/services/ChainManager.js'

/**
 * Minimal Turnkey client stub. The real signing happens through the mocked
 * `@turnkey/viem` `createAccount`, so the client only needs to exist for typing.
 * @returns Empty client token passed through to the mocked Turnkey account factory.
 */
export function createMockTurnkeyClient() {
  return {}
}

/**
 * Parameters used to construct a Turnkey wallet in tests.
 * @description Mirrors the fields whose reconciliation is exercised by both
 * node and React Turnkey wallet tests.
 */
export interface TurnkeyWalletTestParams {
  signWith: string
  ethereumAddress?: string
}

/**
 * Build common Turnkey wallet creation options for tests.
 * @param client - Mock Turnkey client instance.
 * @param chainManager - Chain manager used by the wallet under test.
 * @param params - Turnkey signing key and optional reported address.
 * @returns Shared Turnkey wallet creation options.
 */
export function createTurnkeyWalletOptions<Client>(
  client: Client,
  chainManager: ChainManager,
  params: TurnkeyWalletTestParams,
) {
  return {
    client,
    organizationId: 'org_123',
    signWith: params.signWith,
    ethereumAddress: params.ethereumAddress,
    chainManager,
    actionProviders: {},
    actionSettings: {},
  }
}

/**
 * Registry that models Turnkey's `createAccount` contract for tests: the
 * signing key is resolved from `signWith`, while the reported `.address` is the
 * caller-supplied `ethereumAddress` when present, or the key's own address when
 * omitted (Turnkey fetches it from the API). A matched
 * `signWith`/`ethereumAddress` pair reconciles; a pair pointing at a different
 * key's address is detectably divergent.
 */
export function createTurnkeyKeyRegistry(): MockSigningKeyRegistry {
  const registry = createMockSigningKeyRegistry()
  return {
    /** Address the given signWith key actually controls. */
    addressFor: registry.addressFor,
    /**
     * Account that signs with `signWith`'s key, reporting `ethereumAddress`
     * when supplied, mirroring `createAccount({ signWith, ethereumAddress })`.
     */
    accountFor: registry.accountFor,
  }
}
