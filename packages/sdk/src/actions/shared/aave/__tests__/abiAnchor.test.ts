import { IPool__factory } from '@aave/contract-helpers/dist/esm/v3-pool-contract/typechain/IPool__factory.js'
import { WrappedTokenGatewayV3__factory } from '@aave/contract-helpers/dist/esm/v3-wethgateway-contract/typechain/WrappedTokenGatewayV3__factory.js'
import type { Abi, AbiFunction } from 'viem'
import { toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'

import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'

/**
 * Independent oracle: the local hand-pinned Aave ABIs (`POOL_ABI`,
 * `WETH_GATEWAY_ABI`) are anchored against the canonical ABIs published by
 * `@aave/contract-helpers` (already in the dependency closure). We compare the
 * 4-byte function selectors derived from each, so a drift in the local ABI —
 * a renamed function, a reordered arg list, or a changed type width — flips the
 * selector and fails CI rather than silently shipping a wrong-signature signed tx.
 */
const selectorOf = (abi: Abi, name: string): `0x${string}` => {
  const fn = abi.find(
    (item): item is AbiFunction =>
      item.type === 'function' && item.name === name,
  )
  if (!fn) throw new Error(`function ${name} not found in ABI`)
  return toFunctionSelector(fn)
}

describe('aave ABI anchor against @aave/contract-helpers', () => {
  it.each(['supply', 'withdraw'])(
    'Pool.%s selector matches the canonical IPool ABI',
    (name) => {
      expect(selectorOf(POOL_ABI, name)).toBe(
        selectorOf(IPool__factory.abi as unknown as Abi, name),
      )
    },
  )

  it.each(['depositETH', 'withdrawETH'])(
    'WETHGateway.%s selector matches the canonical WrappedTokenGatewayV3 ABI',
    (name) => {
      expect(selectorOf(WETH_GATEWAY_ABI, name)).toBe(
        selectorOf(WrappedTokenGatewayV3__factory.abi as unknown as Abi, name),
      )
    },
  )

  it('canonical supply arg order is (asset, amount, onBehalfOf, referralCode)', () => {
    const supply = (IPool__factory.abi as unknown as Abi).find(
      (item): item is AbiFunction =>
        item.type === 'function' && item.name === 'supply',
    )!
    expect(supply.inputs.map((i) => i.type)).toEqual([
      'address',
      'uint256',
      'address',
      'uint16',
    ])
  })
})
