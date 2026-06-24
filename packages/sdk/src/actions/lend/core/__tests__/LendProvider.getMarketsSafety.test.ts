import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'

import {
  assetAt,
  callGetMarkets,
  LEND_TEST_MARKET_ASSET as MARKET_ASSET,
  marketConfig,
} from './lendProviderTestUtils.js'

const VAULT = '0x2222222222222222222222222222222222222222' as Address
const OTHER_VAULT = '0x4444444444444444444444444444444444444444' as Address
const WETH = '0x4200000000000000000000000000000000000006' as Address

describe('LendProvider getMarkets safety', () => {
  it('does not surface a caller-supplied market that is not allowlisted', async () => {
    const provider = new MockLendProvider({
      marketAllowlist: [marketConfig(VAULT)],
    })

    const markets = await callGetMarkets(provider, {
      markets: [marketConfig(OTHER_VAULT)],
    })

    expect(markets).toEqual([])
  })

  it('still surfaces a caller-supplied market that is allowlisted', async () => {
    const provider = new MockLendProvider({
      marketAllowlist: [marketConfig(VAULT)],
    })

    const markets = await callGetMarkets(provider, {
      markets: [marketConfig(VAULT)],
    })

    expect(markets).toHaveLength(1)
    expect(markets[0].marketId.address).toBe(VAULT)
  })

  it('still applies chain and asset filters to caller-supplied allowlisted markets', async () => {
    const requestedAsset = assetAt(MARKET_ASSET)
    const otherAsset = assetAt(WETH)
    const allowedMarket = marketConfig(VAULT, { asset: requestedAsset })
    const otherChainMarket = marketConfig(OTHER_VAULT, {
      asset: requestedAsset,
      chainId: 8453,
    })
    const otherAssetMarket = marketConfig(OTHER_VAULT, { asset: otherAsset })
    const provider = new MockLendProvider({
      marketAllowlist: [allowedMarket, otherChainMarket, otherAssetMarket],
    })

    await expect(
      callGetMarkets(provider, {
        chainId: 84532,
        markets: [otherChainMarket],
      }),
    ).resolves.toEqual([])
    await expect(
      callGetMarkets(provider, {
        asset: requestedAsset,
        markets: [otherAssetMarket],
      }),
    ).resolves.toEqual([])
  })
})
