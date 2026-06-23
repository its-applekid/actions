import type { Address, Hex } from 'viem'
import { decodeAbiParameters } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  MockETHAsset,
  MockUSDCAsset,
  MockWETHAsset,
} from '@/__mocks__/MockAssets.js'
import { UNIVERSAL_ROUTER_MSG_SENDER } from '@/actions/swap/core/markets.js'
import {
  LEAF_ROUTER_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/actions/swap/providers/velodrome/abis.js'
import { encodeSwap } from '@/actions/swap/providers/velodrome/encoding/index.js'
import { V2_SWAP_EXACT_IN_INPUT_PARAMS } from '@/actions/swap/providers/velodrome/encoding/routers/v2.js'

import {
  BASE_CHAIN_ID,
  DEADLINE,
  decode,
  FACTORY,
  OP_CHAIN_ID,
  RECIPIENT,
} from './encoding.helpers.js'

describe('encodeSwap', () => {
  describe('v2 router', () => {
    it('encodes swapExactTokensForTokens with 4-field Route', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type V2Route = {
        from: Address
        to: Address
        stable: boolean
        factory: Address
      }
      const { functionName, args } = decode<
        [bigint, bigint, V2Route[], Address, bigint]
      >(V2_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactTokensForTokens')
      expect(args[0]).toBe(1000000n)
      expect(args[1]).toBe(400000000000000000n)
      expect(args[2]).toHaveLength(1)
      expect(args[2][0].factory).toBe(FACTORY)
      expect(args[2][0].stable).toBe(false)
      expect(args[3]).toBe(RECIPIENT)
    })

    it('encodes swapExactETHForTokens for native input', () => {
      const data = encodeSwap({
        assetIn: MockETHAsset,
        assetOut: MockUSDCAsset,
        amountInRaw: 1000000000000000000n,
        amountOutMin: 900000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type V2Route = {
        from: Address
        to: Address
        stable: boolean
        factory: Address
      }
      const { functionName, args } = decode<
        [bigint, V2Route[], Address, bigint]
      >(V2_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactETHForTokens')
      expect(args[0]).toBe(900000n)
      expect(args[1]).toHaveLength(1)
      expect(args[1][0].from).toBe('0x4200000000000000000000000000000000000006')
    })

    it('encodes swapExactTokensForETH for native output', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      const { functionName } = decode(V2_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactTokensForETH')
    })
  })

  describe('leaf router', () => {
    it('encodes swapExactTokensForTokens with 3-field Route (no factory)', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'leaf',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type LeafRoute = { from: Address; to: Address; stable: boolean }
      const { functionName, args } = decode<
        [bigint, bigint, LeafRoute[], Address, bigint]
      >(LEAF_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactTokensForTokens')
      expect(args[0]).toBe(1000000n)
      expect(args[1]).toBe(400000000000000000n)
      expect(args[2]).toHaveLength(1)
      expect(args[2][0].stable).toBe(false)
      expect((args[2][0] as Record<string, unknown>).factory).toBeUndefined()
    })

    it('encodes swapExactETHForTokens for native input', () => {
      const data = encodeSwap({
        assetIn: MockETHAsset,
        assetOut: MockUSDCAsset,
        amountInRaw: 1000000000000000000n,
        amountOutMin: 900000n,
        routerType: 'leaf',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      const { functionName } = decode(LEAF_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactETHForTokens')
    })

    it('encodes stable pool swap', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'leaf',
        stable: true,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type LeafRoute = { from: Address; to: Address; stable: boolean }
      const { args } = decode<[bigint, bigint, LeafRoute[]]>(
        LEAF_ROUTER_ABI,
        data,
      )
      expect(args[2][0].stable).toBe(true)
    })
  })

  describe('universal router', () => {
    it('encodes execute() with V2_SWAP_EXACT_IN command', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'universal',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: BASE_CHAIN_ID,
      })

      const { functionName, args } = decode<[string, string[], bigint]>(
        UNIVERSAL_ROUTER_ABI,
        data,
      )
      expect(functionName).toBe('execute')
      const [commands, inputs, deadline] = args
      expect(commands).toBe('0x08')
      expect(inputs).toHaveLength(1)
      expect(deadline).toBe(BigInt(DEADLINE))
    })

    // Regression for #438: payerIsUser must be true so the router pulls tokens via
    // transferFrom against an ERC20 allowance. payerIsUser=false requires tokens to
    // be pre-deposited to the router, which only works when caller batches atomically.
    it('encodes V2_SWAP_EXACT_IN with payerIsUser = true', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'universal',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: BASE_CHAIN_ID,
      })

      const { args } = decode<[Hex, Hex[], bigint]>(UNIVERSAL_ROUTER_ABI, data)
      const [, inputs] = args
      const decoded = decodeAbiParameters(
        V2_SWAP_EXACT_IN_INPUT_PARAMS,
        inputs[0],
      )
      const payerIsUserIdx = V2_SWAP_EXACT_IN_INPUT_PARAMS.findIndex(
        (p) => p.name === 'payerIsUser',
      )
      expect(decoded[payerIsUserIdx]).toBe(true)
    })

    // Symmetry with the v2/leaf siblings that assert `args[3] === RECIPIENT`.
    // The universal-router path hard-codes the msg.sender sentinel and silently
    // drops the caller's `recipient`. Decode the recipient field and pin both
    // facts so the F003/#444 sentinel behavior cannot drift unnoticed: the day
    // the encoder is fixed to honor `recipient`, this test fails and forces an
    // update rather than shipping a wrong-recipient swap green.
    it('encodes recipient = msg.sender sentinel and drops the caller recipient', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'universal',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: BASE_CHAIN_ID,
      })

      const { args } = decode<[Hex, Hex[], bigint]>(UNIVERSAL_ROUTER_ABI, data)
      const [, inputs] = args
      const decoded = decodeAbiParameters(
        V2_SWAP_EXACT_IN_INPUT_PARAMS,
        inputs[0],
      )
      const recipientIdx = V2_SWAP_EXACT_IN_INPUT_PARAMS.findIndex(
        (p) => p.name === 'recipient',
      )
      const encodedRecipient = decoded[recipientIdx] as Address
      expect(encodedRecipient.toLowerCase()).toBe(
        UNIVERSAL_ROUTER_MSG_SENDER.toLowerCase(),
      )
      // The caller asked for RECIPIENT; the universal-router encoder routes to
      // msg.sender instead. Output must not silently go to the caller's address.
      expect(encodedRecipient.toLowerCase()).not.toBe(RECIPIENT.toLowerCase())
    })
  })

  describe('router type comparison', () => {
    const baseParams = {
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      stable: false,
      factoryAddress: FACTORY,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: OP_CHAIN_ID,
    } as const

    it('produces different calldata per router type', () => {
      const universalData = encodeSwap({
        ...baseParams,
        routerType: 'universal',
      })
      const v2Data = encodeSwap({ ...baseParams, routerType: 'v2' })
      const leafData = encodeSwap({ ...baseParams, routerType: 'leaf' })

      expect(universalData).not.toBe(v2Data)
      expect(v2Data).not.toBe(leafData)
      expect(universalData).not.toBe(leafData)
    })

    it('v2 calldata is longer than leaf (factory field)', () => {
      const v2Data = encodeSwap({ ...baseParams, routerType: 'v2' })
      const leafData = encodeSwap({ ...baseParams, routerType: 'leaf' })

      expect(v2Data.length).toBeGreaterThan(leafData.length)
    })
  })
})
