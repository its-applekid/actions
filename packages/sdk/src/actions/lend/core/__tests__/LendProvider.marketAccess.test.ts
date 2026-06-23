import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type {
  ClosePositionParams,
  GetLendMarketParams,
  GetLendMarketsParams,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransaction,
} from '@/types/lend/index.js'

const MARKET_ASSET = '0x0000000000000000000000000000000000000001' as Address
const VAULT = '0x2222222222222222222222222222222222222222' as Address
const WALLET = '0x3333333333333333333333333333333333333333' as Address

const assetAt = (address: Address): Asset => ({
  address: { 84532: address },
  metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  type: 'erc20',
})

const marketConfig = (
  address: Address,
  overrides: Partial<Pick<LendMarketConfig, 'asset' | 'chainId'>> = {},
): LendMarketConfig => ({
  address,
  chainId: overrides.chainId ?? 84532,
  name: 'Configured Market',
  asset: overrides.asset ?? assetAt(MARKET_ASSET),
  lendProvider: 'morpho',
})

class TestLendProvider extends MockLendProvider {
  public validateMarketAllowed(marketId: LendMarketId): void {
    return super.validateMarketAllowed(marketId)
  }
}

const callOpen = (
  provider: MockLendProvider,
  params: LendOpenPositionParams,
): Promise<LendTransaction> =>
  LendProvider.prototype.openPosition.call(
    provider,
    params,
  ) as Promise<LendTransaction>

const callClose = (
  provider: MockLendProvider,
  params: ClosePositionParams,
): Promise<LendTransaction> =>
  LendProvider.prototype.closePosition.call(
    provider,
    params,
  ) as Promise<LendTransaction>

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

const callGetMarkets = (
  provider: MockLendProvider,
  params: GetLendMarketsParams = {},
): Promise<LendMarket[]> =>
  LendProvider.prototype.getMarkets.call(provider, params) as Promise<
    LendMarket[]
  >

describe('LendProvider market access safety', () => {
  describe('marketBlocklist enforcement (F010)', () => {
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

  describe('empty/undefined allowlist fails closed (F081)', () => {
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
