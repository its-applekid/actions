import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type {
  GetLendMarketParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
} from '@/types/lend/index.js'

import {
  assetAt,
  callClose,
  callGetMarkets,
  callOpen,
  LEND_TEST_MARKET_ASSET as MARKET_ASSET,
  marketConfig,
} from './lendProviderTestUtils.js'

const VAULT = '0x2222222222222222222222222222222222222222' as Address
const WALLET = '0x3333333333333333333333333333333333333333' as Address

class TestLendProvider extends MockLendProvider {
  public validateMarketAllowed(marketId: LendMarketId): void {
    return super.validateMarketAllowed(marketId)
  }
}

const callGetMarket = (
  provider: MockLendProvider,
  params: GetLendMarketParams,
): Promise<LendMarket> =>
  LendProvider.prototype.getMarket.call(provider, params) as Promise<LendMarket>

const callGetPosition = (
  provider: MockLendProvider,
  marketId: LendMarketId,
): Promise<LendMarketPosition> =>
  LendProvider.prototype.getPosition.call(
    provider,
    WALLET,
    marketId,
  ) as Promise<LendMarketPosition>

describe('LendProvider market access safety', () => {
  describe('marketBlocklist enforcement', () => {
    const marketId: LendMarketId = { address: VAULT, chainId: 84532 }
    const blockedProvider = () =>
      new MockLendProvider({
        marketAllowlist: [marketConfig(VAULT)],
        marketBlocklist: [marketConfig(VAULT)],
      })

    it('rejects a blocklisted market on openPosition even when allowlisted', async () => {
      await expect(
        callOpen(blockedProvider(), {
          amount: 1,
          asset: assetAt(MARKET_ASSET),
          marketId,
          walletAddress: WALLET,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects a blocklisted market on closePosition even when allowlisted', async () => {
      await expect(
        callClose(blockedProvider(), {
          amount: 1,
          marketId,
          walletAddress: WALLET,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects a blocklisted market on getMarket even when allowlisted', async () => {
      await expect(
        callGetMarket(blockedProvider(), { address: VAULT, chainId: 84532 }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects a blocklisted market on getPosition even when allowlisted', async () => {
      await expect(
        callGetPosition(blockedProvider(), marketId),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })
  })

  describe('empty/undefined allowlist fails closed', () => {
    const marketId: LendMarketId = { address: VAULT, chainId: 84532 }

    it('rejects openPosition when no allowlist is configured', async () => {
      await expect(
        callOpen(new MockLendProvider(), {
          amount: 1,
          asset: assetAt(MARKET_ASSET),
          marketId,
          walletAddress: WALLET,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects getMarket when no allowlist is configured', async () => {
      await expect(
        callGetMarket(new MockLendProvider(), {
          address: VAULT,
          chainId: 84532,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects getPosition when no allowlist is configured', async () => {
      await expect(
        callGetPosition(new MockLendProvider(), marketId),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects closePosition when no allowlist is configured', async () => {
      await expect(
        callClose(new MockLendProvider(), {
          amount: 1,
          asset: assetAt(MARKET_ASSET),
          marketId,
          walletAddress: WALLET,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('returns no markets from getMarkets when no allowlist is configured', async () => {
      await expect(callGetMarkets(new MockLendProvider())).resolves.toEqual([])
    })

    it('rejects when the allowlist is present but empty', () => {
      const provider = new TestLendProvider({ marketAllowlist: [] })
      expect(() => provider.validateMarketAllowed(marketId)).toThrow(
        MarketNotAllowedError,
      )
    })
  })
})
