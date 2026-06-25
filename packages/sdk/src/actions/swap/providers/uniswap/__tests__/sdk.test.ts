import { CurrencyAmount, Price, Token } from '@uniswap/sdk-core'
import { CommandType } from '@uniswap/universal-router-sdk'
import { Actions, V4Planner } from '@uniswap/v4-sdk'
import { BigNumber } from 'ethers'
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  type Hex,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  CURRENCY_AMOUNT_PARAMS,
  EXACT_INPUT_SINGLE_PARAMS,
  EXACT_OUTPUT_SINGLE_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import {
  calculatePriceImpact,
  encodeUniversalRouterSwap,
  getQuote,
} from '@/actions/swap/providers/uniswap/encoding.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

const USDC: Asset = {
  type: 'erc20',
  address: { 84532: '0x1111111111111111111111111111111111111111' as Address },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const WETH: Asset = {
  type: 'erc20',
  address: { 84532: '0x2222222222222222222222222222222222222222' as Address },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

const ETH: Asset = {
  type: 'native',
  address: { 84532: 'native' },
  metadata: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
}

const QUOTER = '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba' as Address
const POOL_MANAGER = '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408' as Address
const CHAIN_ID = 84532 as SupportedChainId
const FEE = 100
const TICK_SPACING = 2

// Mock sqrtPriceX96 for a ~2000 USDC/WETH pool
// sqrtPriceX96 = sqrt(price) * 2^96, where price = WETH/USDC adjusted for decimals
// For 1 WETH = 2000 USDC: price(token0→token1) depends on sort order
const MOCK_SQRT_PRICE =
  '0x0000000000000000000000000000000000000000000000010000000000000000' as `0x${string}`

function createMockPublicClient(
  amountResult: bigint,
  gasEstimate = 150000n,
): PublicClient {
  return {
    simulateContract: vi.fn().mockResolvedValue({
      result: [amountResult, gasEstimate],
    }),
    readContract: vi.fn().mockResolvedValue(MOCK_SQRT_PRICE),
  } as unknown as PublicClient
}

describe('getQuote', () => {
  it('returns quote for exact-in swap', async () => {
    const publicClient = createMockPublicClient(500000000000000000n) // 0.5 WETH
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: WETH,
      amountInRaw: 100000000n, // 100 USDC
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(quote.amountIn).toBe(100)
    expect(quote.amountOut).toBe(0.5)
    expect(quote.amountInRaw).toBe(100000000n)
    expect(quote.amountOutRaw).toBe(500000000000000000n)
    expect(quote.price).toBeDefined()
    expect(quote.priceInverse).toBeDefined()
    expect(typeof quote.priceImpact).toBe('number')
    expect(quote.priceImpact).toBeGreaterThanOrEqual(0)
    expect(quote.route.path).toEqual([USDC, WETH])
    expect(quote.route.pools).toHaveLength(1)
    expect(quote.gasEstimate).toBe(150000n)

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'quoteExactInputSingle',
      }),
    )
    // Should also read sqrtPriceX96 via extsload
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL_MANAGER,
        functionName: 'extsload',
      }),
    )
  })

  it('returns quote for exact-out swap', async () => {
    const publicClient = createMockPublicClient(100000000n) // 100 USDC needed
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: WETH,
      amountOutRaw: 500000000000000000n, // 0.5 WETH
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(quote.amountInRaw).toBe(100000000n)
    expect(quote.amountOutRaw).toBe(500000000000000000n)

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'quoteExactOutputSingle',
      }),
    )
  })

  it('sorts currency0/currency1 correctly', async () => {
    const publicClient = createMockPublicClient(100000000n)
    await getQuote({
      assetIn: WETH, // higher address
      assetOut: USDC, // lower address
      amountInRaw: 1000000000000000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    expect(call).toEqual(
      expect.objectContaining({
        args: [
          expect.objectContaining({
            poolKey: expect.objectContaining({
              currency0: USDC.address[CHAIN_ID],
              currency1: WETH.address[CHAIN_ID],
            }),
          }),
        ],
      }),
    )
  })

  it('uses address(0) for native ETH in pool key', async () => {
    const publicClient = createMockPublicClient(100000000n)
    await getQuote({
      assetIn: ETH,
      assetOut: USDC,
      amountInRaw: 1000000000000000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    expect(call).toEqual(
      expect.objectContaining({
        args: [
          expect.objectContaining({
            poolKey: expect.objectContaining({
              currency0: zeroAddress,
            }),
          }),
        ],
      }),
    )
  })

  it('uses address(0) for native ETH as output', async () => {
    const publicClient = createMockPublicClient(1000000000000000000n)
    await getQuote({
      assetIn: USDC,
      assetOut: ETH,
      amountInRaw: 100000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    expect(call).toEqual(
      expect.objectContaining({
        args: [
          expect.objectContaining({
            poolKey: expect.objectContaining({
              currency0: zeroAddress,
            }),
          }),
        ],
      }),
    )
  })
})

describe('calculatePriceImpact', () => {
  // sqrtPriceX96 for a pool where 1 USDC-wei buys 5e9 WETH-wei
  // (100 USDC → 0.5 WETH at mid-price)
  // Computed as: sqrt(5e9) * 2^96 ≈ 70711 * 2^96
  const MID_SQRT_PRICE = 5602302599546145575577086272208896n

  it('returns 0 when sqrtPriceX96 is 0', () => {
    const impact = calculatePriceImpact({
      sqrtPriceX96: 0n,
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      zeroForOne: true,
    })
    expect(impact).toBe(0)
  })

  it('returns ~0 for a trade at mid-price', () => {
    // 100 USDC → ~0.5 WETH, which matches the mid-price
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      zeroForOne: true,
    })

    // Very small due to integer sqrt rounding, but near 0
    expect(impact).toBeLessThan(0.001)
  })

  it('returns positive impact when execution is worse than mid-price', () => {
    // Mid-price says we should get ~0.5 WETH, but we only get 0.4 WETH
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 100000000n,
      amountOut: 400000000000000000n, // 0.4 WETH instead of ~0.5
      zeroForOne: true,
    })

    // ~20% price impact
    expect(impact).toBeGreaterThan(0.15)
    expect(impact).toBeLessThan(0.25)
  })

  it('clamps negative impact to 0', () => {
    // Execution was better than mid-price (got more than expected)
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 100000000n,
      amountOut: 600000000000000000n, // 0.6 WETH — better than ~0.5 mid
      zeroForOne: true,
    })

    expect(impact).toBe(0)
  })

  it('works for oneForZero direction', () => {
    // Selling WETH for USDC (oneForZero)
    // At mid-price: 0.5 WETH should get ~100 USDC-wei worth
    // But we only get 90 USDC → some impact
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 500000000000000000n, // 0.5 WETH
      amountOut: 90000000n, // 90 USDC (less than ~100)
      zeroForOne: false,
    })

    expect(impact).toBeGreaterThan(0.05)
    expect(impact).toBeLessThan(0.15)
  })
})

// Pin fixed-point mid-price math against Uniswap SDK price utilities.
describe('calculatePriceImpact vs Uniswap SDK price reference (#318)', () => {
  // Equal decimals make the SDK quote directly comparable to our integer math.
  const token0 = new Token(10, '0x1111111111111111111111111111111111111111', 18)
  const token1 = new Token(10, '0x2222222222222222222222222222222222222222', 18)
  const SQRT_PRICE = 5602302599546145575577086272208896n // ~70711² ≈ 5e9 ratio
  const Q192 = 1n << 192n
  const amountIn = 10n ** 9n

  // Reference mid-price output from the Uniswap SDK: amountIn * sqrtPrice² / 2¹⁹².
  const midPrice = new Price(
    token0,
    token1,
    Q192.toString(),
    (SQRT_PRICE * SQRT_PRICE).toString(),
  )
  const refQuotedOut = BigInt(
    midPrice
      .quote(CurrencyAmount.fromRawAmount(token0, amountIn.toString()))
      .quotient.toString(),
  )

  it('reads ~0 impact at the SDK-derived mid-price output', () => {
    const impact = calculatePriceImpact({
      sqrtPriceX96: SQRT_PRICE,
      amountIn,
      amountOut: refQuotedOut,
      zeroForOne: true,
    })
    expect(Math.abs(impact)).toBeLessThan(1e-4)
  })

  it('reads ~20% impact when execution is 20% below the SDK mid-price', () => {
    const impact = calculatePriceImpact({
      sqrtPriceX96: SQRT_PRICE,
      amountIn,
      amountOut: (refQuotedOut * 80n) / 100n,
      zeroForOne: true,
    })
    expect(impact).toBeGreaterThan(0.199)
    expect(impact).toBeLessThan(0.201)
  })
})

describe('encodeUniversalRouterSwap', () => {
  const baseQuote = {
    price: '0.005',
    priceInverse: '200',
    amountIn: 100,
    amountOut: 0.5,
    amountInRaw: 100000000n,
    amountOutRaw: 500000000000000000n,
    priceImpact: 0.001,
    route: { path: [USDC, WETH], pools: [] },
    gasEstimate: 150000n,
  }

  it('encodes exact-in swap calldata', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(calldata).toMatch(/^0x/)
    expect(calldata.length).toBeGreaterThan(10)
  })

  it('encodes exact-out swap calldata', () => {
    const calldata = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(calldata).toMatch(/^0x/)
    expect(calldata.length).toBeGreaterThan(10)
  })

  it('tags V4 action bytes per Uniswap v4-periphery Actions.sol', () => {
    // Regression: SWAP_EXACT_OUT_SINGLE was previously encoded as 0x07, which
    // V4Router treats as multi-hop SWAP_EXACT_IN. The router decoded our
    // single-hop EXACT_OUTPUT_SINGLE_PARAMS struct as a PathKey[] path and
    // bare-reverted on pool lookup. Correct codes:
    //   0x06 SWAP_EXACT_IN_SINGLE
    //   0x08 SWAP_EXACT_OUT_SINGLE
    const decodeActions = (calldata: `0x${string}`): `0x${string}` => {
      const { args } = decodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        data: calldata,
      })
      const [, inputs] = args as readonly [
        `0x${string}`,
        ReadonlyArray<`0x${string}`>,
        bigint,
      ]
      const [actions] = decodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes[]' }],
        inputs[0]!,
      )
      return actions as `0x${string}`
    }

    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })
    expect(decodeActions(exactIn)).toBe('0x060c0f')

    const exactOut = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })
    expect(decodeActions(exactOut)).toBe('0x080c0f')
  })

  it('produces different calldata for exact-in vs exact-out', () => {
    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const exactOut = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(exactIn).not.toBe(exactOut)
  })

  it('applies slippage to minimum output for exact-in', () => {
    const noSlippage = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const withSlippage = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.05, // 5%
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    // Different slippage should produce different calldata
    expect(noSlippage).not.toBe(withSlippage)
  })
})

// Anchor the hand-rolled V4 encoder against Uniswap's reference encoders.
describe('encodeUniversalRouterSwap vs Uniswap SDK differential', () => {
  const diffQuote = {
    price: '0',
    priceInverse: '0',
    amountIn: 100,
    amountOut: 0.5,
    amountInRaw: 100000000n,
    amountOutRaw: 500000000000000000n,
    priceImpact: 0,
    route: { path: [USDC, WETH], pools: [] },
  }
  const SLIPPAGE = 0.005
  const DEADLINE = 1700000000

  // V4Planner uses ethers v5 ABI encoding, so convert bigint inputs explicitly.
  const bn = (v: bigint) => BigNumber.from(v.toString())

  /** Pull the decoded `execute(commands, inputs, deadline)` out of our calldata. */
  const decodeExecute = (calldata: Hex) => {
    const { args } = decodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI,
      data: calldata,
    })
    return args as readonly [Hex, Hex[], bigint]
  }

  const v4SwapInputOf = (calldata: Hex): Hex => decodeExecute(calldata)[1][0]!

  it('exact-in: byte-equal to V4Planner and pins min-out + take currency', () => {
    const minOut =
      (diffQuote.amountOutRaw * BigInt(Math.round((1 - SLIPPAGE) * 10000))) /
      10000n
    const ours = encodeUniversalRouterSwap({
      amountInRaw: diffQuote.amountInRaw,
      assetIn: USDC,
      assetOut: WETH,
      slippage: SLIPPAGE,
      deadline: DEADLINE,
      recipient: zeroAddress,
      chainId: CHAIN_ID,
      quote: diffQuote,
      universalRouterAddress: zeroAddress,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    // Reference: encode the same intent with the canonical V4Planner.
    const poolKey = {
      currency0: USDC.address[CHAIN_ID]!,
      currency1: WETH.address[CHAIN_ID]!,
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: zeroAddress,
    }
    const planner = new V4Planner()
    planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey,
        zeroForOne: true,
        amountIn: bn(diffQuote.amountInRaw),
        amountOutMinimum: bn(minOut),
        hookData: '0x',
      },
    ])
    planner.addAction(Actions.SETTLE_ALL, [
      poolKey.currency0,
      bn(diffQuote.amountInRaw),
    ])
    planner.addAction(Actions.TAKE_ALL, [poolKey.currency1, bn(minOut)])

    const [commands, , deadline] = decodeExecute(ours)
    // Command byte ties to the SDK's own V4_SWAP constant (16 maps to 0x10).
    expect(commands).toBe(
      `0x${CommandType.V4_SWAP.toString(16).padStart(2, '0')}`,
    )
    expect(deadline).toBe(BigInt(DEADLINE))
    expect(v4SwapInputOf(ours)).toBe(planner.finalize())

    // Independent decode of the security-critical fields out of OUR bytes.
    const [actions, params] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      v4SwapInputOf(ours),
    )
    // 0x060c0f = SWAP_EXACT_IN_SINGLE(0x06) + SETTLE_ALL(0x0c) + TAKE_ALL(0x0f).
    expect(actions).toBe('0x060c0f')
    const [swap] = decodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, params[0]!)
    expect(swap.amountIn).toBe(diffQuote.amountInRaw)
    expect(swap.amountOutMinimum).toBe(minOut)
    const [takeCurrency, takeMin] = decodeAbiParameters(
      CURRENCY_AMOUNT_PARAMS,
      params[2]!,
    )
    expect((takeCurrency as Address).toLowerCase()).toBe(
      WETH.address[CHAIN_ID]!.toLowerCase(),
    )
    expect(takeMin).toBe(minOut)
  })

  it('exact-out: byte-equal to V4Planner and pins max-in', () => {
    const maxIn =
      diffQuote.amountInRaw +
      (diffQuote.amountInRaw * BigInt(Math.round(SLIPPAGE * 10000))) / 10000n
    const ours = encodeUniversalRouterSwap({
      amountOutRaw: diffQuote.amountOutRaw,
      assetIn: USDC,
      assetOut: WETH,
      slippage: SLIPPAGE,
      deadline: DEADLINE,
      recipient: zeroAddress,
      chainId: CHAIN_ID,
      quote: diffQuote,
      universalRouterAddress: zeroAddress,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const poolKey = {
      currency0: USDC.address[CHAIN_ID]!,
      currency1: WETH.address[CHAIN_ID]!,
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: zeroAddress,
    }
    const planner = new V4Planner()
    planner.addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
      {
        poolKey,
        zeroForOne: true,
        amountOut: bn(diffQuote.amountOutRaw),
        amountInMaximum: bn(maxIn),
        hookData: '0x',
      },
    ])
    planner.addAction(Actions.SETTLE_ALL, [poolKey.currency0, bn(maxIn)])
    planner.addAction(Actions.TAKE_ALL, [
      poolKey.currency1,
      bn(diffQuote.amountOutRaw),
    ])

    const [commands, , deadline] = decodeExecute(ours)
    expect(commands).toBe(
      `0x${CommandType.V4_SWAP.toString(16).padStart(2, '0')}`,
    )
    expect(deadline).toBe(BigInt(DEADLINE))
    expect(v4SwapInputOf(ours)).toBe(planner.finalize())

    const [, params] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      v4SwapInputOf(ours),
    )
    const [swap] = decodeAbiParameters(EXACT_OUTPUT_SINGLE_PARAMS, params[0]!)
    expect(swap.amountOut).toBe(diffQuote.amountOutRaw)
    expect(swap.amountInMaximum).toBe(maxIn)
  })

  it('native-in: byte-equal to V4Planner (ETH settled as currency0)', () => {
    const nativeQuote = {
      ...diffQuote,
      amountInRaw: 10n ** 18n,
      amountOutRaw: 2000000000n,
    }
    const minOut =
      (nativeQuote.amountOutRaw * BigInt(Math.round((1 - SLIPPAGE) * 10000))) /
      10000n
    const ours = encodeUniversalRouterSwap({
      amountInRaw: nativeQuote.amountInRaw,
      assetIn: ETH,
      assetOut: USDC,
      slippage: SLIPPAGE,
      deadline: DEADLINE,
      recipient: zeroAddress,
      chainId: CHAIN_ID,
      quote: nativeQuote,
      universalRouterAddress: zeroAddress,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    // ETH (address(0)) sorts as currency0; USDC currency1; zeroForOne true.
    const poolKey = {
      currency0: zeroAddress,
      currency1: USDC.address[CHAIN_ID]!,
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: zeroAddress,
    }
    const planner = new V4Planner()
    planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey,
        zeroForOne: true,
        amountIn: bn(nativeQuote.amountInRaw),
        amountOutMinimum: bn(minOut),
        hookData: '0x',
      },
    ])
    planner.addAction(Actions.SETTLE_ALL, [
      zeroAddress,
      bn(nativeQuote.amountInRaw),
    ])
    planner.addAction(Actions.TAKE_ALL, [poolKey.currency1, bn(minOut)])

    const [commands, , deadline] = decodeExecute(ours)
    expect(commands).toBe(
      `0x${CommandType.V4_SWAP.toString(16).padStart(2, '0')}`,
    )
    expect(deadline).toBe(BigInt(DEADLINE))
    expect(v4SwapInputOf(ours)).toBe(planner.finalize())
  })

  // V4 TAKE_ALL has no recipient, so the caller recipient must not appear.
  it('drops the caller recipient (output is not routed to recipient != msg.sender)', () => {
    const recipient = '0x00000000000000000000000000000000DeaDBeef' as Address
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: diffQuote.amountInRaw,
      assetIn: USDC,
      assetOut: WETH,
      slippage: SLIPPAGE,
      deadline: DEADLINE,
      recipient,
      chainId: CHAIN_ID,
      quote: diffQuote,
      universalRouterAddress: zeroAddress,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(calldata.toLowerCase()).not.toContain(
      recipient.slice(2).toLowerCase(),
    )
  })
})
