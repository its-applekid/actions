import type { Address, Hex } from 'viem'
import { encodeAbiParameters, encodeFunctionData, erc20Abi } from 'viem'
import { base } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { MockUSDCAsset, MockWETHAsset } from '@/__mocks__/MockAssets.js'
import {
  CURRENCY_AMOUNT_PARAMS,
  EXACT_INPUT_SINGLE_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import { getUniswapAddresses } from '@/actions/swap/providers/uniswap/addresses.js'
import { assertUniswapV4QuoteBound } from '@/actions/swap/providers/uniswap/decode.js'
import { encodeUniversalRouterSwap } from '@/actions/swap/providers/uniswap/encoding.js'
import { UNISWAP } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapQuote } from '@/types/swap/index.js'

const CHAIN = base.id as SupportedChainId
const ROUTER = getUniswapAddresses(CHAIN).universalRouter
const WALLET = '0x1234567890123456789012345678901234567890' as Address
const EXPECTED_POOL = { fee: 500, tickSpacing: 10 } as const

function priceFixture(): SwapPrice {
  return {
    price: '1500',
    priceInverse: '0.00066',
    amountIn: 1,
    amountOut: 1500,
    amountInRaw: 1_000_000n,
    amountOutRaw: 500_000_000_000_000_000n,
    priceImpact: 0.001,
    route: { path: [MockUSDCAsset, MockWETHAsset], pools: [] },
  }
}

/** Build a SwapQuote carrying real Universal Router V4 calldata for assetIn -> assetOut. */
function uniswapQuote(overrides?: {
  assetIn?: Asset
  assetOut?: Asset
  calldata?: Hex
}): SwapQuote {
  const assetIn = overrides?.assetIn ?? MockUSDCAsset
  const assetOut = overrides?.assetOut ?? MockWETHAsset
  const swapCalldata =
    overrides?.calldata ??
    encodeUniversalRouterSwap({
      amountInRaw: 1_000_000n,
      assetIn,
      assetOut,
      slippage: 0.005,
      deadline: 9_999_999_999,
      recipient: WALLET,
      chainId: CHAIN,
      quote: priceFixture(),
      universalRouterAddress: ROUTER,
      fee: 500,
      tickSpacing: 10,
    })
  return {
    assetIn,
    assetOut,
    chainId: CHAIN,
    amountIn: 1,
    amountInRaw: 1_000_000n,
    amountOut: 1500,
    amountOutRaw: 500_000_000_000_000_000n,
    amountOutMin: 1492,
    amountOutMinRaw: 497_500_000_000_000_000n,
    price: 1500,
    priceInverse: 0.00066,
    priceImpact: 0.001,
    route: { path: [assetIn, assetOut], pools: [] },
    execution: { swapCalldata, routerAddress: ROUTER, value: 0n },
    provider: UNISWAP,
    slippage: 0.005,
    deadline: 9_999_999_999,
    quotedAt: 1,
    expiresAt: 9_999_999_999,
    recipient: WALLET,
  }
}

function encodeExactInputWithPool(overrides: {
  fee?: number
  tickSpacing?: number
  hooks?: Address
  deadline?: number
}): Hex {
  const tokenIn = MockUSDCAsset.address[CHAIN] as Address
  const tokenOut = MockWETHAsset.address[CHAIN] as Address
  const [currency0, currency1] =
    tokenIn.toLowerCase() < tokenOut.toLowerCase()
      ? [tokenIn, tokenOut]
      : [tokenOut, tokenIn]
  const zeroForOne = tokenIn.toLowerCase() === currency0.toLowerCase()
  const actions = '0x060c0f' as Hex
  const amountOutMinimum = 497_500_000_000_000_000n
  const input = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [
      actions,
      [
        encodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, [
          {
            poolKey: {
              currency0,
              currency1,
              fee: overrides.fee ?? EXPECTED_POOL.fee,
              tickSpacing: overrides.tickSpacing ?? EXPECTED_POOL.tickSpacing,
              hooks:
                overrides.hooks ?? '0x0000000000000000000000000000000000000000',
            },
            zeroForOne,
            amountIn: 1_000_000n,
            amountOutMinimum,
            hookData: '0x',
          },
        ]),
        encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenIn, 1_000_000n]),
        encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [
          tokenOut,
          amountOutMinimum,
        ]),
      ],
    ],
  )
  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: ['0x10', [input], BigInt(overrides.deadline ?? 9_999_999_999)],
  })
}

describe('assertUniswapV4QuoteBound', () => {
  it('accepts the canonical V4 swap of the quoted pair (output settles to msg.sender)', () => {
    expect(() =>
      assertUniswapV4QuoteBound(uniswapQuote(), EXPECTED_POOL),
    ).not.toThrow()
  })

  it('accepts exact-output calldata whose take amount is the quoted output amount', () => {
    const exactOutput = encodeUniversalRouterSwap({
      amountOutRaw: 500_000_000_000_000_000n,
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      slippage: 0.005,
      deadline: 9_999_999_999,
      recipient: WALLET,
      chainId: CHAIN,
      quote: priceFixture(),
      universalRouterAddress: ROUTER,
      fee: 500,
      tickSpacing: 10,
    })

    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: exactOutput }),
        EXPECTED_POOL,
      ),
    ).not.toThrow()
  })

  it('rejects calldata that reverses the swap direction (sells the wrong token)', () => {
    // Real V4 calldata for WETH->USDC (same pool, opposite direction), but the
    // quote metadata claims USDC->WETH. Sorted poolKey is identical; only
    // zeroForOne differs, so the direction check is what rejects it.
    const reversed = encodeUniversalRouterSwap({
      amountInRaw: 1_000_000n,
      assetIn: MockWETHAsset,
      assetOut: MockUSDCAsset,
      slippage: 0.005,
      deadline: 9_999_999_999,
      recipient: WALLET,
      chainId: CHAIN,
      quote: priceFixture(),
      universalRouterAddress: ROUTER,
      fee: 500,
      tickSpacing: 10,
    })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: reversed }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata whose input amount is larger than the quote amount', () => {
    const largerInput = encodeUniversalRouterSwap({
      amountInRaw: 2_000_000n,
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      slippage: 0.005,
      deadline: 9_999_999_999,
      recipient: WALLET,
      chainId: CHAIN,
      quote: priceFixture(),
      universalRouterAddress: ROUTER,
      fee: 500,
      tickSpacing: 10,
    })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: largerInput }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata for a different pool than the quoted pair', () => {
    const DAI: Asset = {
      type: 'erc20',
      address: { [CHAIN]: '0x6666666666666666666666666666666666666666' },
      metadata: { name: 'Dai', symbol: 'DAI', decimals: 18 },
    }
    // Real V4 calldata for USDC->DAI, but the quote metadata claims USDC->WETH.
    const otherPool = encodeUniversalRouterSwap({
      amountInRaw: 1_000_000n,
      assetIn: MockUSDCAsset,
      assetOut: DAI,
      slippage: 0.005,
      deadline: 9_999_999_999,
      recipient: WALLET,
      chainId: CHAIN,
      quote: priceFixture(),
      universalRouterAddress: ROUTER,
      fee: 500,
      tickSpacing: 10,
    })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: otherPool }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata whose pool fee differs from the trusted market config', () => {
    const wrongFee = encodeExactInputWithPool({ fee: 3_000 })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: wrongFee }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata whose pool hooks differ from the trusted market config', () => {
    const hookAddress = '0x000000000000000000000000000000000000bEEF'
    const hookedPool = encodeExactInputWithPool({ hooks: hookAddress })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: hookedPool }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata whose Universal Router deadline differs from the quote', () => {
    const wrongDeadline = encodeExactInputWithPool({ deadline: 9_999_999_998 })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: wrongDeadline }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata that is not a Universal Router execute() call', () => {
    const approve = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: ['0x000000000000000000000000000000000000bEEF', 2n ** 256n - 1n],
    })
    expect(() =>
      assertUniswapV4QuoteBound(
        uniswapQuote({ calldata: approve }),
        EXPECTED_POOL,
      ),
    ).toThrow(QuoteCalldataMismatchError)
  })
})
