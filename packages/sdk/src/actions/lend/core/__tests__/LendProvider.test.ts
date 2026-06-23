import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockUSDCAsset } from '@/__mocks__/MockAssets.js'
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
import { validateChainSupported } from '@/utils/validation.js'

// Address the MockLendProvider's `createMockMarket` reports as the market
// underlying for every chain. The new open-path asset guard compares the
// caller asset against this, so a matching open must use it.
const MARKET_ASSET = '0x0000000000000000000000000000000000000001' as Address
const VAULT = '0x2222222222222222222222222222222222222222' as Address
const OTHER_VAULT = '0x4444444444444444444444444444444444444444' as Address
const WETH = '0x4200000000000000000000000000000000000006' as Address
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

// Test helper class that exposes protected validation methods as public
class TestLendProvider extends MockLendProvider {
  public validateMarketAllowed(marketId: LendMarketId): void {
    return super.validateMarketAllowed(marketId)
  }

  public isChainSupported(chainId: number): boolean {
    return super.isChainSupported(chainId)
  }
}

describe('LendProvider', () => {
  describe('constructor and configuration', () => {
    it('should initialize with basic config', () => {
      const provider = new MockLendProvider()
      expect(provider).toBeDefined()
      expect(provider.supportedChainIds()).toContain(84532)
    })

    it('should store market allowlist when provided', () => {
      const mockMarket: LendMarketConfig = {
        address: '0x1234' as Address,
        chainId: 84532,
        name: 'Test Market',
        asset: {
          address: { 84532: '0xUSC' as Address },
          metadata: {
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
          },
          type: 'erc20',
        },
        lendProvider: 'morpho',
      }

      const provider = new MockLendProvider({
        marketAllowlist: [mockMarket],
      })
      expect(provider.config.marketAllowlist).toEqual([mockMarket])
    })
  })

  describe('abstract methods implementation', () => {
    it('should implement getMarket method', async () => {
      const provider = new MockLendProvider()
      const marketId: LendMarketId = {
        address: '0x1234' as Address,
        chainId: 84532,
      }

      const market = await provider.getMarket(marketId)
      expect(market.marketId.chainId).toBe(84532)
      expect(market.name).toBe('Mock Market')
      expect(market.apy.total).toBe(0.05)
    })

    it('should accept LendMarketConfig and extract address/chainId', async () => {
      const provider = new MockLendProvider()
      const mockMarket: LendMarketConfig = {
        address: '0x5678' as Address,
        chainId: 84532,
        name: 'Test Config Market',
        asset: MockUSDCAsset,
        lendProvider: 'morpho',
      }

      const market = await provider.getMarket(mockMarket)
      expect(market.marketId.chainId).toBe(84532)
      expect(market.marketId.address).toBe('0x5678')
      expect(market.name).toBe('Mock Market')
    })

    it('should implement getMarkets method', async () => {
      const provider = new MockLendProvider()
      const markets = await provider.getMarkets()

      expect(Array.isArray(markets)).toBe(true)
      expect(markets).toHaveLength(1)
      expect(markets[0].name).toBe('Mock Market')
    })

    it('should accept optional filter parameters for getMarkets', async () => {
      const provider = new MockLendProvider()
      const markets = await provider.getMarkets({ chainId: 84532 })

      expect(Array.isArray(markets)).toBe(true)
      expect(markets).toHaveLength(1)
    })

    it('should accept asset filtering parameter', async () => {
      const provider = new MockLendProvider()
      const mockAsset: Asset = {
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        address: { 84532: '0x123' as Address },
        type: 'erc20',
      }

      const markets = await provider.getMarkets({ asset: mockAsset })
      expect(Array.isArray(markets)).toBe(true)
    })

    it('should implement getPosition method', async () => {
      const provider = new MockLendProvider()
      const position = await provider.getPosition('0x5678' as Address, {
        address: '0x1234' as Address,
        chainId: 84532 as const,
      })

      expect(position.balance).toBe(500000n)
      expect(position.shares).toBe(500000n)
      expect(position.marketId.chainId).toBe(84532)
    })

    it('should implement closePosition method', async () => {
      const provider = new MockLendProvider()
      const result = await provider.closePosition({
        amount: 100,
        marketId: { address: '0x1234' as Address, chainId: 84532 as const },
        walletAddress: '0x5678' as Address,
      })

      expect(result.amount).toBe(100n)
      expect(result.marketId).toBe('0x1234')
      expect(typeof result.transactionData).toBe('object')
    })

    it('should implement withdraw method', async () => {
      const provider = new MockLendProvider()
      const result = await provider.withdraw(
        '0x0000000000000000000000000000000000000001' as Address,
        500n,
        84532,
        'market-2',
      )

      expect(result.amount).toBe(500n)
      expect(result.marketId).toBe('market-2')
    })

    it('should implement openPosition method', async () => {
      const provider = new MockLendProvider()
      const mockAsset = {
        address: { 84532: '0x123' as Address },
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        type: 'erc20' as const,
      }

      const result = await provider.openPosition({
        amount: 1000,
        asset: mockAsset,
        marketId: { address: '0x1234' as Address, chainId: 84532 },
        walletAddress: '0x5678' as Address,
      })

      expect(result.amount).toBe(1000000000n)
      expect(result.assetAddress).toBe('0x123')
      expect(result.marketId).toBe('0x1234')
      expect(result.apy).toBe(0.05)
    })
  })

  describe('approvalMode resolution', () => {
    // The caller asset must match the market's resolved underlying
    // (MARKET_ASSET) now that openPosition guards the asset, and the market
    // must be allowlisted now that the allowlist fails closed.
    const mockAsset = {
      address: {
        84532: MARKET_ASSET,
      },
      metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      type: 'erc20' as const,
    }
    const baseParams = {
      amount: 1000,
      asset: mockAsset,
      marketId: {
        address: VAULT,
        chainId: 84532,
      } as LendMarketId,
      walletAddress: WALLET,
    }
    const allowlist: LendMarketConfig[] = [marketConfig(VAULT)]

    // MockLendProvider replaces `openPosition` with a vi.fn() in its
    // constructor. To exercise the real base-class flow (which builds the
    // approval tx around `_openPosition`'s output), call through the prototype.
    const callBaseOpenPosition = (
      provider: MockLendProvider,
      params: LendOpenPositionParams,
    ): Promise<LendTransaction> =>
      LendProvider.prototype.openPosition.call(
        provider,
        params,
      ) as Promise<LendTransaction>

    // Last 32 bytes of approve(spender, amount) hold `amount`.
    const approvalAmountHex = (result: LendTransaction): string =>
      (result.transactionData.approval?.data ?? '').slice(-64)

    const EXACT_AMOUNT_HEX = (1000n * 10n ** 18n).toString(16)
    const MAX_UINT256_HEX = 'f'.repeat(64)

    it('defaults to "exact". approval encodes the required amount', async () => {
      const provider = new MockLendProvider({ marketAllowlist: allowlist })
      const result = await callBaseOpenPosition(provider, baseParams)
      expect(approvalAmountHex(result).replace(/^0+/, '')).toBe(
        EXACT_AMOUNT_HEX,
      )
    })

    it('honours per-call "max" override. approval uses maxUint256', async () => {
      const provider = new MockLendProvider({ marketAllowlist: allowlist })
      const result = await callBaseOpenPosition(provider, {
        ...baseParams,
        approvalMode: 'max',
      })
      expect(approvalAmountHex(result)).toBe(MAX_UINT256_HEX)
    })

    it('honours per-provider config approvalMode default', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: allowlist,
        approvalMode: 'max',
      })
      const result = await callBaseOpenPosition(provider, baseParams)
      expect(approvalAmountHex(result)).toBe(MAX_UINT256_HEX)
    })

    it('per-call override beats per-provider config', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: allowlist,
        approvalMode: 'max',
      })
      const result = await callBaseOpenPosition(provider, {
        ...baseParams,
        approvalMode: 'exact',
      })
      expect(approvalAmountHex(result).replace(/^0+/, '')).toBe(
        EXACT_AMOUNT_HEX,
      )
    })
  })

  describe('supportedChainIds', () => {
    it('should return array of supported chain IDs', () => {
      const provider = new MockLendProvider()
      const chainIds = provider.supportedChainIds()

      expect(Array.isArray(chainIds)).toBe(true)
      expect(chainIds).toContain(84532)
      expect(chainIds.length).toBeGreaterThan(0)
    })
  })

  describe('validation', () => {
    it('should call validation for unsupported chainId', () => {
      const provider = new TestLendProvider()

      expect(() => {
        validateChainSupported(999, provider.supportedChainIds())
      }).toThrow('Chain 999 is not supported')
    })

    it('should call validation for market allowlist', () => {
      const allowedMarket: LendMarketConfig = {
        address: '0x1234' as Address,
        chainId: 84532,
        name: 'Allowed Market',
        asset: {
          address: { 84532: '0xUSC' as Address },
          metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
          type: 'erc20',
        },
        lendProvider: 'morpho',
      }

      const provider = new TestLendProvider({
        marketAllowlist: [allowedMarket],
      })

      expect(() => {
        provider.validateMarketAllowed({
          address: '0x1234' as Address,
          chainId: 84532,
        })
      }).not.toThrow()

      expect(() => {
        provider.validateMarketAllowed({
          address: '0x9999' as Address,
          chainId: 84532,
        })
      }).toThrow('not in the market allowlist')
    })

    it('should validate chain support correctly', () => {
      const provider = new TestLendProvider()

      expect(provider.isChainSupported(84532)).toBe(true)
      expect(provider.isChainSupported(999)).toBe(false)
    })
  })

  describe('public getters', () => {
    it('should provide access to marketAllowlist via getter', () => {
      const mockMarket: LendMarketConfig = {
        address: '0xabc' as Address,
        chainId: 84532,
        name: 'Market ABC',
        asset: {
          address: { 84532: '0xdef' as Address },
          metadata: {
            decimals: 18,
            name: 'Test Token',
            symbol: 'TEST',
          },
          type: 'erc20',
        },
        lendProvider: 'morpho',
      }

      const provider = new MockLendProvider({
        marketAllowlist: [mockMarket],
      })

      expect(provider.config.marketAllowlist).toEqual([mockMarket])
    })

    it('should return undefined for marketAllowlist when not provided', () => {
      const provider = new MockLendProvider()
      expect(provider.config.marketAllowlist).toBeUndefined()
    })
  })

  // Bypass MockLendProvider's vi.fn() public-method stubs to exercise the real
  // base-class flow (allowlist/blocklist/asset guards) the providers inherit.
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
    LendProvider.prototype.getMarket.call(
      provider,
      params,
    ) as Promise<LendMarket>
  const callGetMarkets = (
    provider: MockLendProvider,
    params: GetLendMarketsParams = {},
  ): Promise<LendMarket[]> =>
    LendProvider.prototype.getMarkets.call(provider, params) as Promise<
      LendMarket[]
    >
  const callGetPosition = (
    provider: MockLendProvider,
    marketId: LendMarketId,
  ): Promise<LendMarketPosition> =>
    LendProvider.prototype.getPosition.call(
      provider,
      WALLET,
      marketId,
    ) as Promise<LendMarketPosition>

  describe('openPosition asset symmetry (F008)', () => {
    const marketId: LendMarketId = { address: VAULT, chainId: 84532 }

    it('throws MarketNotAllowedError and never builds an approval when the caller asset does not match the market underlying', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: [marketConfig(VAULT)],
      })

      // WETH != the vault's underlying (MARKET_ASSET). Mirrors the wrong-token
      // max-mode approval hazard: this must reject before any approve() is built.
      await expect(
        callOpen(provider, {
          amount: 1000,
          asset: assetAt(WETH),
          marketId,
          walletAddress: WALLET,
          approvalMode: 'max',
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('succeeds and approves the correct token when the caller asset matches the market underlying', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: [marketConfig(VAULT)],
      })

      const result = await callOpen(provider, {
        amount: 1000,
        asset: assetAt(MARKET_ASSET),
        marketId,
        walletAddress: WALLET,
      })

      expect(result.transactionData.approval?.to).toBe(MARKET_ASSET)
      expect(result.transactionData.position).toBeDefined()
    })

    it('uses the trusted market asset decimals when caller metadata is spoofed', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: [marketConfig(VAULT)],
      })
      const spoofedAsset = {
        ...assetAt(MARKET_ASSET),
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      }

      const result = await callOpen(provider, {
        amount: 1,
        asset: spoofedAsset,
        marketId,
        walletAddress: WALLET,
      })

      expect(result.amount).toBe(1_000_000_000_000_000_000n)
    })

    it('uses the trusted market asset type when caller type is spoofed', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: [marketConfig(VAULT)],
      })
      const spoofedNativeAsset: Asset = {
        ...assetAt(MARKET_ASSET),
        type: 'native',
      }

      const result = await callOpen(provider, {
        amount: 1,
        asset: spoofedNativeAsset,
        marketId,
        walletAddress: WALLET,
      })

      expect(result.transactionData.approval).toBeDefined()
      expect(result.transactionData.approval?.to).toBe(MARKET_ASSET)
    })

    it('uses the trusted market asset decimals on closePosition when caller metadata is spoofed', async () => {
      const provider = new MockLendProvider({
        marketAllowlist: [marketConfig(VAULT)],
      })
      const spoofedAsset = {
        ...assetAt(MARKET_ASSET),
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      }

      const result = await callClose(provider, {
        amount: 1,
        asset: spoofedAsset,
        marketId,
        walletAddress: WALLET,
      })

      expect(result.amount).toBe(1_000_000_000_000_000_000n)
      expect(result.assetAddress).toBe(MARKET_ASSET)
    })
  })

  describe('marketBlocklist enforcement (F010)', () => {
    const marketId: LendMarketId = { address: VAULT, chainId: 84532 }
    const blockedProvider = () =>
      new MockLendProvider({
        // Listed in BOTH: the blocklist must win.
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

    it('rejects openPosition (write path) when no allowlist is configured', async () => {
      await expect(
        callOpen(new MockLendProvider(), {
          amount: 1,
          asset: assetAt(MARKET_ASSET),
          marketId,
          walletAddress: WALLET,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects getMarket (read path) when no allowlist is configured, matching the write path', async () => {
      await expect(
        callGetMarket(new MockLendProvider(), {
          address: VAULT,
          chainId: 84532,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects getPosition (read path) when no allowlist is configured', async () => {
      await expect(
        callGetPosition(new MockLendProvider(), marketId),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('rejects closePosition (write path) when no allowlist is configured', async () => {
      await expect(
        callClose(new MockLendProvider(), {
          amount: 1,
          asset: assetAt(MARKET_ASSET),
          marketId,
          walletAddress: WALLET,
        }),
      ).rejects.toBeInstanceOf(MarketNotAllowedError)
    })

    it('returns no markets from getMarkets (read list path) when no allowlist is configured', async () => {
      await expect(callGetMarkets(new MockLendProvider())).resolves.toEqual([])
    })

    it('rejects when the allowlist is present but empty', () => {
      const provider = new TestLendProvider({ marketAllowlist: [] })
      expect(() => provider.validateMarketAllowed(marketId)).toThrow(
        MarketNotAllowedError,
      )
    })
  })

  describe('getMarkets({ markets }) override is constrained to the allowlist (F102)', () => {
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
      const otherAssetMarket = marketConfig(OTHER_VAULT, {
        asset: otherAsset,
      })
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
})
