import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  isMarketAsset,
  selectAllowedLendMarkets,
  validateMarketAsset,
} from '@/actions/lend/utils/markets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type { LendProviderName } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { LendMarket, LendMarketConfig } from '@/types/lend/index.js'

const CHAIN = 84532 as SupportedChainId
const OTHER_CHAIN = 8453 as SupportedChainId

// USDC on Base, in EIP-55 checksummed and all-lowercase form. The two strings
// address the same token; a case-sensitive compare would wrongly reject one.
const USDC_CHECKSUM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address
const USDC_LOWER = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address
const WETH = '0x4200000000000000000000000000000000000006' as Address

function makeAsset(
  entries: Partial<Record<SupportedChainId, Address | 'native'>>,
  type: Asset['type'] = 'erc20',
): Asset {
  return {
    address: entries,
    metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
    type,
  }
}

function makeMarket(
  asset: Asset,
  chainId: SupportedChainId = CHAIN,
): LendMarket {
  return {
    marketId: {
      address: '0x00000000000000000000000000000000000000aa' as Address,
      chainId,
    },
    name: 'Test Vault',
    asset,
    supply: { totalAssets: 0n, totalShares: 0n },
    apy: { total: 0, native: 0, totalRewards: 0, performanceFee: 0 },
    metadata: {
      owner: '0x00000000000000000000000000000000000000bb' as Address,
      curator: '0x00000000000000000000000000000000000000cc' as Address,
      fee: 0,
      lastUpdate: 0,
    },
  }
}

describe('isMarketAsset / validateMarketAsset', () => {
  it('rejects an asset with no address configured for the market chain even when the market underlying is also unconfigured there (closes the undefined === undefined hole)', () => {
    // Both the market underlying and the provided asset only know about
    // OTHER_CHAIN, so each resolves to `undefined` on the market's chain. Raw
    // `===` treats `undefined === undefined` as a match; the guard must not.
    const market = makeMarket(makeAsset({ [OTHER_CHAIN]: USDC_LOWER }), CHAIN)
    const asset = makeAsset({ [OTHER_CHAIN]: USDC_LOWER })

    expect(isMarketAsset(market, asset)).toBe(false)
    expect(() => validateMarketAsset(market, asset)).toThrow(
      MarketNotAllowedError,
    )
  })

  it('accepts a checksummed asset against a lowercase market underlying (case-insensitive parity with lendMarketIdMatches)', () => {
    const market = makeMarket(makeAsset({ [CHAIN]: USDC_LOWER }))
    const asset = makeAsset({ [CHAIN]: USDC_CHECKSUM })

    expect(isMarketAsset(market, asset)).toBe(true)
    expect(() => validateMarketAsset(market, asset)).not.toThrow()
  })

  it('rejects a genuinely different asset', () => {
    const market = makeMarket(makeAsset({ [CHAIN]: USDC_LOWER }))
    const asset = makeAsset({ [CHAIN]: WETH })

    expect(isMarketAsset(market, asset)).toBe(false)
    expect(() => validateMarketAsset(market, asset)).toThrow(
      MarketNotAllowedError,
    )
  })

  it('rejects when only the provided asset is unconfigured on the market chain', () => {
    const market = makeMarket(makeAsset({ [CHAIN]: USDC_LOWER }))
    const asset = makeAsset({ [OTHER_CHAIN]: USDC_LOWER })

    expect(isMarketAsset(market, asset)).toBe(false)
  })

  it('matches a native market underlying against a native asset by sentinel (isAddressEqual would throw on "native")', () => {
    const market = makeMarket(makeAsset({ [CHAIN]: 'native' }, 'native'))
    const asset = makeAsset({ [CHAIN]: 'native' }, 'native')

    expect(isMarketAsset(market, asset)).toBe(true)
  })

  it('rejects a native asset against an ERC-20 market underlying', () => {
    const market = makeMarket(makeAsset({ [CHAIN]: USDC_LOWER }))
    const asset = makeAsset({ [CHAIN]: 'native' }, 'native')

    expect(isMarketAsset(market, asset)).toBe(false)
  })
})

const MORPHO: LendProviderName = 'morpho'

function makeConfig(
  address: Address,
  chainId: SupportedChainId = CHAIN,
): LendMarketConfig {
  return {
    address,
    chainId,
    name: 'Config',
    asset: makeAsset({ [chainId]: USDC_LOWER }),
    lendProvider: MORPHO,
  }
}

const ALLOWED = makeConfig(
  '0x00000000000000000000000000000000000000a1' as Address,
)
const BLOCKED = makeConfig(
  '0x00000000000000000000000000000000000000b2' as Address,
)
const UNLISTED = makeConfig(
  '0x00000000000000000000000000000000000000c3' as Address,
)

describe('selectAllowedLendMarkets', () => {
  it('keeps a caller-supplied market only when it is in the allowlist', () => {
    const result = selectAllowedLendMarkets([ALLOWED, UNLISTED], {
      marketAllowlist: [ALLOWED],
    })
    expect(result).toEqual([ALLOWED])
  })

  it('drops a market that is on the blocklist even when also allowlisted', () => {
    const result = selectAllowedLendMarkets([ALLOWED, BLOCKED], {
      marketAllowlist: [ALLOWED, BLOCKED],
      marketBlocklist: [BLOCKED],
    })
    expect(result).toEqual([ALLOWED])
  })

  it('returns nothing when the allowlist is empty or undefined (fail closed)', () => {
    expect(selectAllowedLendMarkets([ALLOWED], {})).toEqual([])
    expect(
      selectAllowedLendMarkets([ALLOWED], { marketAllowlist: [] }),
    ).toEqual([])
  })

  it('matches the allowlist case-insensitively on address', () => {
    const lower = makeConfig(USDC_LOWER)
    const upperTarget = makeConfig(USDC_CHECKSUM)
    const result = selectAllowedLendMarkets([upperTarget], {
      marketAllowlist: [lower],
    })
    expect(result).toEqual([lower])
  })
})
