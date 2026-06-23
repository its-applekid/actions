import type { Address, Hex } from 'viem'
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
} from 'viem'
import { baseSepolia, optimism } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { MockUSDCAsset, MockWETHAsset } from '@/__mocks__/MockAssets.js'
import { UNIVERSAL_ROUTER_ABI } from '@/actions/swap/providers/velodrome/abis.js'
import { getChainConfig } from '@/actions/swap/providers/velodrome/config.js'
import { assertVelodromeQuoteBound } from '@/actions/swap/providers/velodrome/encoding/decode.js'
import { encodeSwap } from '@/actions/swap/providers/velodrome/encoding/index.js'
import { V2_SWAP_EXACT_IN_INPUT_PARAMS } from '@/actions/swap/providers/velodrome/encoding/routers/v2.js'
import type { ResolvedPoolConfig } from '@/actions/swap/providers/velodrome/types.js'
import { VELODROME } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'

const OP = optimism.id as SupportedChainId
const BASE_SEPOLIA = baseSepolia.id as SupportedChainId
const WALLET = '0x1234567890123456789012345678901234567890' as Address
const ATTACKER = '0x000000000000000000000000000000000000bEEF' as Address
const FACTORY = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a' as Address
const V2_POOL = {
  type: 'v2',
  stable: false,
} as const satisfies ResolvedPoolConfig

function velodromeQuote(
  chainId: SupportedChainId,
  swapCalldata: Hex,
  recipient: Address = WALLET,
): SwapQuote {
  return {
    assetIn: MockUSDCAsset,
    assetOut: MockWETHAsset,
    chainId,
    amountIn: 1,
    amountInRaw: 1_000_000n,
    amountOut: 0.4,
    amountOutRaw: 400_000_000_000_000_000n,
    amountOutMin: 0.398,
    amountOutMinRaw: 398_000_000_000_000_000n,
    price: 0.4,
    priceInverse: 2.5,
    priceImpact: 0.001,
    route: { path: [MockUSDCAsset, MockWETHAsset], pools: [] },
    execution: {
      swapCalldata,
      routerAddress: getChainConfig(chainId).contracts.router,
      value: 0n,
    },
    provider: VELODROME,
    slippage: 0.005,
    deadline: 9_999_999_999,
    quotedAt: 1,
    expiresAt: 9_999_999_999,
    recipient,
  }
}

function v2Calldata(recipient: Address): Hex {
  return encodeSwap({
    assetIn: MockUSDCAsset,
    assetOut: MockWETHAsset,
    amountInRaw: 1_000_000n,
    amountOutMin: 398_000_000_000_000_000n,
    routerType: 'v2',
    stable: false,
    factoryAddress: FACTORY,
    recipient,
    deadline: 9_999_999_999,
    chainId: OP,
  })
}

function assertBound(
  quote: SwapQuote,
  expectedPool: ResolvedPoolConfig = V2_POOL,
): void {
  assertVelodromeQuoteBound(
    quote,
    expectedPool,
    getChainConfig(quote.chainId).contracts.poolFactory,
  )
}

describe('assertVelodromeQuoteBound', () => {
  describe('v2/leaf router (literal recipient)', () => {
    it('accepts calldata whose recipient equals the quoted wallet', () => {
      expect(() =>
        assertBound(velodromeQuote(OP, v2Calldata(WALLET))),
      ).not.toThrow()
    })

    it('rejects calldata whose recipient is a different address', () => {
      // Metadata claims WALLET, but the router `to` arg routes output to ATTACKER.
      expect(() =>
        assertBound(velodromeQuote(OP, v2Calldata(ATTACKER))),
      ).toThrow(QuoteCalldataMismatchError)
    })

    it('rejects calldata whose input amount is larger than the quote amount', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 2_000_000n,
        amountOutMin: 398_000_000_000_000_000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: WALLET,
        deadline: 9_999_999_999,
        chainId: OP,
      })
      expect(() => assertBound(velodromeQuote(OP, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })

    it('rejects router calldata whose stable flag differs from the market config', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1_000_000n,
        amountOutMin: 398_000_000_000_000_000n,
        routerType: 'v2',
        stable: true,
        factoryAddress: FACTORY,
        recipient: WALLET,
        deadline: 9_999_999_999,
        chainId: OP,
      })
      expect(() => assertBound(velodromeQuote(OP, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })

    it('rejects router calldata whose deadline differs from the quote', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1_000_000n,
        amountOutMin: 398_000_000_000_000_000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: WALLET,
        deadline: 9_999_999_998,
        chainId: OP,
      })
      expect(() => assertBound(velodromeQuote(OP, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })
  })

  describe('universal router (msg.sender sentinel)', () => {
    it('accepts calldata that encodes the msg.sender sentinel recipient', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1_000_000n,
        amountOutMin: 398_000_000_000_000_000n,
        routerType: 'universal',
        stable: false,
        factoryAddress: FACTORY,
        recipient: WALLET,
        deadline: 9_999_999_999,
        chainId: BASE_SEPOLIA,
      })
      expect(() =>
        assertBound(velodromeQuote(BASE_SEPOLIA, data)),
      ).not.toThrow()
    })

    it('rejects universal calldata that bakes a literal (non-sentinel) recipient', () => {
      // Hand-craft execute() with a V2_SWAP_EXACT_IN input whose recipient is
      // ATTACKER instead of the msg.sender sentinel.
      const route = encodePacked(
        ['address', 'bool', 'address'],
        [
          MockUSDCAsset.address[OP] as Address,
          false,
          MockWETHAsset.address[OP] as Address,
        ],
      )
      const input = encodeAbiParameters(V2_SWAP_EXACT_IN_INPUT_PARAMS, [
        ATTACKER,
        1_000_000n,
        398_000_000_000_000_000n,
        route,
        true,
        false,
      ])
      const data = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: ['0x08', [input], 9_999_999_999n],
      })
      expect(() => assertBound(velodromeQuote(BASE_SEPOLIA, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })

    it('rejects universal calldata whose stable flag differs from the market config', () => {
      const route = encodePacked(
        ['address', 'bool', 'address'],
        [
          MockUSDCAsset.address[BASE_SEPOLIA] as Address,
          true,
          MockWETHAsset.address[BASE_SEPOLIA] as Address,
        ],
      )
      const input = encodeAbiParameters(V2_SWAP_EXACT_IN_INPUT_PARAMS, [
        '0x0000000000000000000000000000000000000001',
        1_000_000n,
        398_000_000_000_000_000n,
        route,
        true,
        false,
      ])
      const data = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: ['0x08', [input], 9_999_999_999n],
      })
      expect(() => assertBound(velodromeQuote(BASE_SEPOLIA, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })

    it('rejects universal calldata whose deadline differs from the quote', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1_000_000n,
        amountOutMin: 398_000_000_000_000_000n,
        routerType: 'universal',
        stable: false,
        factoryAddress: FACTORY,
        recipient: WALLET,
        deadline: 9_999_999_998,
        chainId: BASE_SEPOLIA,
      })
      expect(() => assertBound(velodromeQuote(BASE_SEPOLIA, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })

    it('rejects universal calldata with a hidden extra route hop', () => {
      const route = encodePacked(
        ['address', 'bool', 'address', 'bool', 'address'],
        [
          MockUSDCAsset.address[BASE_SEPOLIA] as Address,
          false,
          MockWETHAsset.address[BASE_SEPOLIA] as Address,
          false,
          ATTACKER,
        ],
      )
      const input = encodeAbiParameters(V2_SWAP_EXACT_IN_INPUT_PARAMS, [
        '0x0000000000000000000000000000000000000001',
        1_000_000n,
        398_000_000_000_000_000n,
        route,
        true,
        false,
      ])
      const data = encodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: ['0x08', [input], 9_999_999_999n],
      })

      expect(() => assertBound(velodromeQuote(BASE_SEPOLIA, data))).toThrow(
        QuoteCalldataMismatchError,
      )
    })
  })

  it('rejects calldata that is not a recognized Velodrome swap', () => {
    const approve = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [ATTACKER, 2n ** 256n - 1n],
    })
    expect(() => assertBound(velodromeQuote(OP, approve))).toThrow(
      QuoteCalldataMismatchError,
    )
  })
})
