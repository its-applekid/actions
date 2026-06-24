import { marketIdMatches } from '@/actions/borrow/core/markets.js'
import {
  findMatchingConfig,
  selectAllowedConfigs,
} from '@/actions/shared/marketConfigs.js'
import {
  InvalidParamsError,
  MarketNotAllowedError,
  ProviderNotConfiguredError,
} from '@/core/error/errors.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowQuote,
} from '@/types/borrow/index.js'

/**
 * Reject a pre-built `BorrowQuote` whose `action` doesn't match the wallet
 * dispatch method that received it (e.g. passing an `open` quote to
 * `wallet.borrow.repay`).
 */
export function validateQuoteAction(
  quote: BorrowQuote,
  expectedAction: BorrowQuote['action'],
): void {
  if (quote.action !== expectedAction) {
    throw new InvalidParamsError({
      param: 'quote.action',
      expected: expectedAction,
      received: quote.action,
    })
  }
}

/**
 * Strict allowlist lookup with blocklist enforcement: returns the matched
 * trusted `BorrowMarketConfig` or throws `MarketNotAllowedError`.
 * @description Empty/undefined allowlists fail closed. Blocklist matches
 * are rejected with a distinct reason. Used by `BorrowProvider` to
 * resolve marketId to full config once on both read and write paths so
 * concrete providers don't repeat the lookup and so blocklist semantics
 * apply uniformly.
 */
export function requireAllowlistedBorrowMarketConfig(
  marketId: BorrowMarketId,
  config: {
    marketAllowlist?: readonly BorrowMarketConfig[]
    marketBlocklist?: readonly BorrowMarketConfig[]
  },
): BorrowMarketConfig {
  const match = findMatchingConfig({
    configs: config.marketAllowlist,
    target: marketId,
    matches: marketIdMatches,
  })
  if (!match) {
    throw new MarketNotAllowedError({
      address: marketId.marketId,
      chainId: marketId.chainId,
      reason: 'Market not in borrow provider allowlist',
    })
  }
  if (config.marketBlocklist?.length) {
    const blocked = findMatchingConfig({
      configs: config.marketBlocklist,
      target: marketId,
      matches: marketIdMatches,
    })
    if (blocked) {
      throw new MarketNotAllowedError({
        address: marketId.marketId,
        chainId: marketId.chainId,
        reason: 'Market is on the marketBlocklist',
      })
    }
  }
  return match
}

/**
 * Intersect a list of candidate market configs with the allowlist and drop any
 * that are blocklisted.
 * @description The read-path twin of `requireAllowlistedBorrowMarketConfig`:
 * it filters instead of throwing so a list endpoint silently drops misses.
 * Returns the matched **allowlist** entries (not the candidate objects), so a
 * caller-supplied `getMarkets({ markets })` override can only narrow the
 * allowlisted set. It can never surface an off-allowlist reserve, smuggle a
 * tampered config onto the read path, or return a blocklisted market.
 * @param candidates - Market configs to filter
 * @param config - Provider allowlist/blocklist
 * @returns Allowlisted, non-blocklisted market configs matched from `candidates`
 */
export function selectAllowlistedBorrowMarketConfigs(
  candidates: readonly BorrowMarketConfig[],
  config: {
    marketAllowlist?: readonly BorrowMarketConfig[]
    marketBlocklist?: readonly BorrowMarketConfig[]
  },
): BorrowMarketConfig[] {
  return selectAllowedConfigs({
    candidates,
    allowlist: config.marketAllowlist,
    blocklist: config.marketBlocklist,
    matches: marketIdMatches,
  })
}

/**
 * Validate that at least one configured borrow provider's allowlist
 * contains the supplied `marketId`. Used to gate dispatch of pre-built
 * quotes that arrive from untrusted or stale callers.
 */
export function validateBorrowMarketIdInAnyAllowlist(
  marketId: BorrowMarketId,
  providers: ReadonlyArray<{ config: BorrowProviderConfig }>,
): void {
  for (const provider of providers) {
    if (
      findMatchingConfig({
        configs: provider.config.marketAllowlist,
        target: marketId,
        matches: marketIdMatches,
      })
    ) {
      return
    }
  }
  throw new ProviderNotConfiguredError({
    provider: marketId.marketId,
    details: `No borrow provider configured for market on chain ${marketId.chainId}`,
  })
}
