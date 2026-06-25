import { isAddressEqual } from 'viem'

import {
  findMatchingConfig,
  selectAllowedConfigs,
} from '@/actions/shared/marketConfigs.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type {
  LendMarket,
  LendMarketConfig,
  LendMarketId,
} from '@/types/lend/index.js'

/**
 * Structural equality for two `LendMarketId` values.
 * @description Compares `chainId` and a case-insensitive `address`. Shared
 * by `findMarketInAllowlist` (namespace routing) and
 * `LendProvider.validateMarketAllowed` (per-call allowlist check) so the
 * two-field comparison lives in one place.
 * @param a - First market identifier
 * @param b - Second market identifier
 * @returns True when the identifiers target the same address on the same chain
 */
export function lendMarketIdMatches(a: LendMarketId, b: LendMarketId): boolean {
  return (
    a.address.toLowerCase() === b.address.toLowerCase() &&
    a.chainId === b.chainId
  )
}

/**
 * Find a market config in an allowlist by address + chainId (case-insensitive on address).
 * @description Shared between `BaseLendNamespace.getProviderForMarket` and
 * `MorphoLendProvider._getPosition` to avoid duplicate match logic.
 * @param allowlist - Optional list of allowed markets. Undefined or empty input always returns undefined
 * @param marketId - Market identifier to look up
 * @returns The matching market config, or undefined if not present
 */
export function findMarketInAllowlist(
  allowlist: readonly LendMarketConfig[] | undefined,
  marketId: LendMarketId,
): LendMarketConfig | undefined {
  return findMatchingConfig({
    configs: allowlist,
    target: marketId,
    matches: lendMarketIdMatches,
  })
}

/**
 * Validates that an asset matches the market's asset.
 * @description Rejects a caller asset that is not configured as the market's
 * underlying on the market chain.
 * @param market - Market information
 * @param asset - Asset to validate
 * @throws MarketNotAllowedError if asset doesn't match the market's asset
 */
export function validateMarketAsset(market: LendMarket, asset: Asset): void {
  if (!isMarketAsset(market, asset)) {
    const marketAssetAddress = market.asset.address[market.marketId.chainId]
    const providedAssetAddress = asset.address[market.marketId.chainId]
    throw new MarketNotAllowedError({
      address: market.marketId.address,
      chainId: market.marketId.chainId,
      reason: `Asset mismatch: provided ${providedAssetAddress} but market ${market.marketId.address} uses ${marketAssetAddress}`,
    })
  }
}

/**
 * Checks if an asset matches the market's asset
 * @param market - Market information
 * @param asset - Asset to check
 * @returns true if asset matches market's asset, false otherwise
 * @description Total over the address maps: an address the market or the asset
 * does not configure for `market.marketId.chainId` resolves to `undefined`, and
 * `undefined` never matches (so `undefined === undefined` can no longer pass an
 * off-chain asset). Hex addresses compare case-insensitively via `isAddressEqual`
 * to match `lendMarketIdMatches`; native assets use the `'native'` sentinel
 * rather than a hex address, so they compare by identity.
 */
export function isMarketAsset(market: LendMarket, asset: Asset): boolean {
  const chainId = market.marketId.chainId
  const marketAssetAddress = market.asset.address[chainId]
  const providedAssetAddress = asset.address[chainId]

  if (!marketAssetAddress || !providedAssetAddress) return false

  if (marketAssetAddress === 'native' || providedAssetAddress === 'native') {
    return marketAssetAddress === providedAssetAddress
  }

  return isAddressEqual(marketAssetAddress, providedAssetAddress)
}

/**
 * Intersect a list of candidate market configs with the provider's allowlist
 * and drop any that are blocklisted.
 * @returns Trusted allowlist entries matched by candidates.
 */
export function selectAllowedLendMarkets(
  candidates: readonly LendMarketConfig[],
  config: {
    marketAllowlist?: readonly LendMarketConfig[]
    marketBlocklist?: readonly LendMarketConfig[]
  },
): LendMarketConfig[] {
  return selectAllowedConfigs({
    candidates,
    allowlist: config.marketAllowlist,
    blocklist: config.marketBlocklist,
    matches: lendMarketIdMatches,
  })
}
