import type { Address, Hex } from 'viem'
import { base } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import {
  MockETHAsset,
  MockUSDCAsset,
  MockWETHAsset,
} from '@/__mocks__/MockAssets.js'
import { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
import { getUniswapAddresses } from '@/actions/swap/providers/uniswap/addresses.js'
import { encodeUniversalRouterSwap } from '@/actions/swap/providers/uniswap/encoding.js'
import { UniswapSwapProvider } from '@/actions/swap/providers/uniswap/UniswapSwapProvider.js'
import { getChainConfig } from '@/actions/swap/providers/velodrome/config.js'
import { UNISWAP } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  QuoteCalldataMismatchError,
  RouterNotAllowedError,
} from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SwapPrice, SwapQuote } from '@/types/swap/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

const CHAIN = base.id as SupportedChainId
const WALLET = '0x1234567890123456789012345678901234567890' as Address
const UNISWAP_ROUTER = getUniswapAddresses(CHAIN).universalRouter
const VELODROME_ROUTER = getChainConfig(CHAIN).contracts.router

function uniswapProvider(): UniswapSwapProvider {
  const chainManager = new MockChainManager({
    supportedChains: [CHAIN],
  }) as unknown as ChainManager
  return new UniswapSwapProvider(
    {
      marketAllowlist: [
        { assets: [MockUSDCAsset, MockWETHAsset], fee: 500, tickSpacing: 10 },
        { assets: [MockETHAsset, MockWETHAsset], fee: 500, tickSpacing: 10 },
      ],
    },
    chainManager,
  )
}

function mockWallet(): Wallet {
  return {
    address: WALLET,
    send: vi.fn().mockResolvedValue({ transactionHash: '0xtx1' }),
    sendBatch: vi.fn().mockResolvedValue({ transactionHash: '0xtx2' }),
  } as unknown as Wallet
}

function quote(
  overrides?: Partial<SwapQuote['execution']>,
  quoteOverrides: Partial<Pick<SwapQuote, 'assetIn' | 'amountInRaw'>> = {},
): SwapQuote {
  const assetIn = quoteOverrides.assetIn ?? MockUSDCAsset
  const amountInRaw = quoteOverrides.amountInRaw ?? 1_000_000n
  return {
    assetIn,
    assetOut: MockWETHAsset,
    chainId: CHAIN,
    amountIn: 1,
    amountInRaw,
    amountOut: 0.0005,
    amountOutRaw: 500_000_000_000_000n,
    amountOutMin: 0.0004975,
    amountOutMinRaw: 497_500_000_000_000n,
    price: 0.0005,
    priceInverse: 2000,
    priceImpact: 0.001,
    route: { path: [assetIn, MockWETHAsset], pools: [] },
    execution: {
      swapCalldata: '0x1234' as Hex,
      routerAddress: UNISWAP_ROUTER,
      value: 0n,
      ...overrides,
    },
    provider: UNISWAP,
    slippage: 0.005,
    deadline: 9_999_999_999,
    quotedAt: 1,
    expiresAt: 9_999_999_999,
    recipient: WALLET,
  }
}

function nativeExactInputCalldata(): Hex {
  const price: SwapPrice = {
    price: '0.0005',
    priceInverse: '2000',
    amountIn: 1,
    amountOut: 0.0005,
    amountInRaw: 1_000n,
    amountOutRaw: 500_000_000_000_000n,
    priceImpact: 0.001,
    route: { path: [MockETHAsset, MockWETHAsset], pools: [] },
  }
  return encodeUniversalRouterSwap({
    amountInRaw: 1_000n,
    assetIn: MockETHAsset,
    assetOut: MockWETHAsset,
    slippage: 0.005,
    deadline: 9_999_999_999,
    recipient: WALLET,
    chainId: CHAIN,
    quote: price,
    universalRouterAddress: UNISWAP_ROUTER,
    fee: 500,
    tickSpacing: 10,
  })
}

describe('WalletSwapNamespace calldata-integrity binding', () => {
  it('rejects a quote whose routerAddress is not the resolved provider router', () => {
    // provider='uniswap', but routerAddress points at a Velodrome router (F264):
    // the user would approve a router they never intended.
    const namespace = new WalletSwapNamespace(
      { uniswap: uniswapProvider() },
      mockWallet(),
    )
    return expect(
      namespace.execute(quote({ routerAddress: VELODROME_ROUTER })),
    ).rejects.toThrow(RouterNotAllowedError)
  })

  it('rejects a non-zero native value on an ERC-20-in swap', () => {
    const namespace = new WalletSwapNamespace(
      { uniswap: uniswapProvider() },
      mockWallet(),
    )
    // Correct router so the router check passes; value must be 0 for USDC-in.
    return expect(
      namespace.execute(quote({ routerAddress: UNISWAP_ROUTER, value: 1n })),
    ).rejects.toThrow(QuoteCalldataMismatchError)
  })

  it('rejects a native-in swap whose value differs from amountInRaw', () => {
    const namespace = new WalletSwapNamespace(
      { uniswap: uniswapProvider() },
      mockWallet(),
    )
    return expect(
      namespace.execute(
        quote(
          {
            routerAddress: UNISWAP_ROUTER,
            swapCalldata: nativeExactInputCalldata(),
            value: 999n,
          },
          { assetIn: MockETHAsset, amountInRaw: 1_000n },
        ),
      ),
    ).rejects.toThrow(QuoteCalldataMismatchError)
  })
})
