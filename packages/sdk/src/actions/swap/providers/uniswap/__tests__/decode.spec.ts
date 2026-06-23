import type { Address, Hex } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'
import { base } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { MockUSDCAsset, MockWETHAsset } from '@/__mocks__/MockAssets.js'
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

describe('assertUniswapV4QuoteBound', () => {
  it('accepts the canonical V4 swap of the quoted pair (output settles to msg.sender)', () => {
    expect(() => assertUniswapV4QuoteBound(uniswapQuote())).not.toThrow()
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
      assertUniswapV4QuoteBound(uniswapQuote({ calldata: reversed })),
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
      assertUniswapV4QuoteBound(uniswapQuote({ calldata: largerInput })),
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
      assertUniswapV4QuoteBound(uniswapQuote({ calldata: otherPool })),
    ).toThrow(QuoteCalldataMismatchError)
  })

  it('rejects calldata that is not a Universal Router execute() call', () => {
    const approve = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: ['0x000000000000000000000000000000000000bEEF', 2n ** 256n - 1n],
    })
    expect(() =>
      assertUniswapV4QuoteBound(uniswapQuote({ calldata: approve })),
    ).toThrow(QuoteCalldataMismatchError)
  })
})
