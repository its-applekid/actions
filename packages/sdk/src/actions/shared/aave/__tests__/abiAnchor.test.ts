import { IPool__factory } from '@aave/contract-helpers/dist/esm/v3-pool-contract/typechain/IPool__factory.js'
import { WrappedTokenGatewayV3__factory } from '@aave/contract-helpers/dist/esm/v3-wethgateway-contract/typechain/WrappedTokenGatewayV3__factory.js'
import type { AbiFunction, AbiParameter } from 'viem'
import { toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'

import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'

/**
 * Independent oracle: the local hand-pinned Aave ABIs (`POOL_ABI`,
 * `WETH_GATEWAY_ABI`) are anchored against the canonical ABIs published by
 * `@aave/contract-helpers` (already in the dependency closure). The selector
 * check catches renamed functions and changed type widths. The input-list check
 * catches same-type argument reorders that leave the selector identical.
 *
 * The deep `dist/esm/.../typechain` imports are the only public path to the raw
 * factory ABIs (`@aave/contract-helpers` re-exports the service classes, not the
 * factories). If a future version restructures that layout this file breaks at
 * import time, which is a loud CI failure, not a silently disabled anchor.
 */
const isNamedFunction = (item: unknown, name: string): item is AbiFunction =>
  typeof item === 'object' &&
  item !== null &&
  'type' in item &&
  item.type === 'function' &&
  'name' in item &&
  item.name === name &&
  'inputs' in item &&
  Array.isArray(item.inputs)

const fnOf = (abi: readonly unknown[], name: string): AbiFunction => {
  const fn = abi.find((item): item is AbiFunction =>
    isNamedFunction(item, name),
  )
  if (!fn) throw new Error(`function ${name} not found in ABI`)
  return fn
}

const selectorOf = (abi: readonly unknown[], name: string): `0x${string}` =>
  toFunctionSelector(fnOf(abi, name))

/**
 * Assert the local input list matches the canonical one positionally. Types must
 * match at every position; names must match wherever the canonical ABI names the
 * param. The canonical typechain leaves some leading params unnamed (e.g. the
 * WETH gateway `pool` arg), so we skip the name check only at those positions,
 * while still pinning every named position against reorder.
 */
const assertInputsMatch = (
  local: readonly AbiParameter[],
  canonical: readonly AbiParameter[],
): void => {
  expect(local.length).toBe(canonical.length)
  canonical.forEach((canonicalParam, index) => {
    expect(local[index]!.type).toBe(canonicalParam.type)
    if (canonicalParam.name) {
      expect(local[index]!.name).toBe(canonicalParam.name)
    }
  })
}

const POOL_FUNCTIONS = ['supply', 'withdraw'] as const
const GATEWAY_FUNCTIONS = ['depositETH', 'withdrawETH'] as const

const IPOOL_ABI = IPool__factory.abi
const GATEWAY_ABI = WrappedTokenGatewayV3__factory.abi

describe('aave ABI anchor against @aave/contract-helpers', () => {
  it.each(POOL_FUNCTIONS)(
    'Pool.%s selector matches the canonical IPool ABI',
    (name) => {
      expect(selectorOf(POOL_ABI, name)).toBe(selectorOf(IPOOL_ABI, name))
    },
  )

  it.each(GATEWAY_FUNCTIONS)(
    'WETHGateway.%s selector matches the canonical WrappedTokenGatewayV3 ABI',
    (name) => {
      expect(selectorOf(WETH_GATEWAY_ABI, name)).toBe(
        selectorOf(GATEWAY_ABI, name),
      )
    },
  )

  it.each(POOL_FUNCTIONS)(
    'Pool.%s arg order (name + type) matches the canonical IPool ABI',
    (name) => {
      assertInputsMatch(
        fnOf(POOL_ABI, name).inputs,
        fnOf(IPOOL_ABI, name).inputs,
      )
    },
  )

  it.each(GATEWAY_FUNCTIONS)(
    'WETHGateway.%s arg order (name + type) matches the canonical ABI',
    (name) => {
      assertInputsMatch(
        fnOf(WETH_GATEWAY_ABI, name).inputs,
        fnOf(GATEWAY_ABI, name).inputs,
      )
    },
  )
})
