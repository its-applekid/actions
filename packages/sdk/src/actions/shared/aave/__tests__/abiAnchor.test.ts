import { IPool__factory } from '@aave/contract-helpers/dist/esm/v3-pool-contract/typechain/IPool__factory.js'
import { WrappedTokenGatewayV3__factory } from '@aave/contract-helpers/dist/esm/v3-wethgateway-contract/typechain/WrappedTokenGatewayV3__factory.js'
import type { AbiFunction, AbiParameter } from 'viem'
import { toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'

import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'

/**
 * Anchors local Aave ABIs to @aave/contract-helpers selectors and input order.
 * Deep factory imports are the available raw ABI source and should fail loud.
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

/** Match input types and canonical names, skipping unnamed canonical params. */
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
