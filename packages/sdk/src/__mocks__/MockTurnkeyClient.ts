import type { Address, LocalAccount } from 'viem'
import { getAddress } from 'viem'

import { createSigningAccount } from '@/__mocks__/utils.js'

/**
 * Minimal Turnkey client stub. The real signing happens through the mocked
 * `@turnkey/viem` `createAccount`, so the client only needs to exist for typing.
 * @returns An empty object cast to the requested Turnkey client type.
 */
export function createMockTurnkeyClient<T = unknown>(): T {
  return {} as T
}

/**
 * Registry that models Turnkey's `createAccount` contract for tests: the
 * signing key is resolved from `signWith`, while the reported `.address` is the
 * caller-supplied `ethereumAddress` when present, or the key's own address when
 * omitted (Turnkey fetches it from the API). A matched
 * `signWith`/`ethereumAddress` pair reconciles; a pair pointing at a different
 * key's address is detectably divergent.
 */
export function createTurnkeyKeyRegistry() {
  const keysBySignWith = new Map<string, LocalAccount>()
  const keyFor = (signWith: string): LocalAccount => {
    const existing = keysBySignWith.get(signWith)
    if (existing) return existing
    const key = createSigningAccount()
    keysBySignWith.set(signWith, key)
    return key
  }
  return {
    /** Address the given signWith key actually controls. */
    addressFor: (signWith: string): Address => keyFor(signWith).address,
    /**
     * Account that signs with `signWith`'s key, reporting `ethereumAddress`
     * when supplied, mirroring `createAccount({ signWith, ethereumAddress })`.
     */
    accountFor: (signWith: string, ethereumAddress?: Address): LocalAccount => {
      const key = keyFor(signWith)
      return {
        ...key,
        address: ethereumAddress ? getAddress(ethereumAddress) : key.address,
      }
    },
  }
}
