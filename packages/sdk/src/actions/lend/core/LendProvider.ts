import type { Address } from 'viem'

import {
  lendMarketIdMatches,
  selectAllowedLendMarkets,
  validateMarketAsset,
} from '@/actions/lend/utils/markets.js'
import { BaseActionProvider } from '@/actions/shared/BaseActionProvider.js'
import {
  filterMatchingConfigs,
  findMatchingConfig,
} from '@/actions/shared/marketConfigs.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  MarketIdRequiredError,
  MarketNotAllowedError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ApprovalMode,
  LendProviderConfig,
  LendSettings,
} from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  ClosePositionParams,
  GetLendMarketParams,
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
  LendMarketPosition,
  LendOpenPosition,
  LendOpenPositionInternalParams,
  LendOpenPositionParams,
  LendTransaction,
  TransactionData,
} from '@/types/lend/index.js'
import {
  buildErc20ApprovalTx,
  resolveErc20ApprovalAmount,
} from '@/utils/approve.js'
import { isNativeAsset, parseAssetAmount } from '@/utils/assets.js'
import { validateWalletAddress } from '@/utils/validation.js'

/** Inputs for the base class's ERC-20 lend approval helper. */
interface BuildLendApprovalParams {
  position: LendOpenPosition
  approvalMode: ApprovalMode
  amountWei: bigint
}

/**
 * Lending provider abstract class
 * @description Base class for lending provider implementations
 */
export abstract class LendProvider<
  TConfig extends LendProviderConfig = LendProviderConfig,
> extends BaseActionProvider<TConfig, LendSettings> {
  /**
   * Create a new lending provider
   * @param config - Provider-specific lending configuration
   * @param chainManager - Chain manager for blockchain interactions
   * @param settings - Shared lend settings applied across all providers
   */
  protected constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: LendSettings,
  ) {
    super(config, chainManager, settings)
  }

  /**
   * Open a lending position
   * @description Validates wallet, chain, market allowlist/blocklist, and the
   * caller asset against the resolved market underlying before amount parsing,
   * provider routing, or approval construction.
   * @param params - Market, asset, wallet, amount, and optional approval mode
   * @returns Promise resolving to lending transaction details
   * @throws MarketNotAllowedError when the market is not allowlisted, is
   * blocklisted, or the caller asset does not match the market underlying
   */
  async openPosition(params: LendOpenPositionParams): Promise<LendTransaction> {
    validateWalletAddress(params.walletAddress)

    this.validateMarketAllowed(params.marketId)

    // Mirror closePosition's asset guard before building any approval or
    // deposit, so a mismatched asset can never reach signed approve() calldata.
    const market = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })
    validateMarketAsset(market, params.asset)
    const trustedAsset = market.asset

    // Convert human-readable amount to wei using the market asset's decimals.
    const amountWei = parseAssetAmount(trustedAsset, params.amount)

    const position = await this._openPosition({
      ...params,
      asset: trustedAsset,
      amountWei,
      walletAddress: params.walletAddress,
    })

    // Native deposits send ETH inline as msg.value; no approval is needed.
    // ERC-20 deposits resolve approval mode and build an approve(spender, amount) tx.
    const approval = isNativeAsset(trustedAsset)
      ? undefined
      : this.buildLendApproval({
          position,
          approvalMode: this.resolveApprovalMode(params.approvalMode),
          amountWei,
        })

    return {
      amount: amountWei,
      assetAddress: position.assetAddress,
      marketId: params.marketId.address,
      apy: position.apy,
      transactionData: {
        ...(approval ? { approval } : {}),
        position: position.transaction,
      },
    }
  }

  /**
   * Get detailed market information
   * @param address - Market contract address
   * @param chainId - Chain ID where the market exists
   * @returns Promise resolving to market information
   */
  async getMarket(params: GetLendMarketParams): Promise<LendMarket> {
    const marketId: LendMarketId = {
      address: params.address,
      chainId: params.chainId,
    }

    this.validateMarketAllowed(marketId)
    return this._getMarket(marketId)
  }

  /**
   * Get list of available lending markets
   * @description Lists configured allowlisted markets after dropping
   * blocklisted entries. Caller-supplied `markets` can only narrow the
   * configured allowlist; omitted or empty allowlists return no markets.
   * @param params - Optional chain, asset, and market-narrowing filters
   * @returns Promise resolving to array of market information
   * @throws ChainNotSupportedError when a requested chain is unsupported
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    if (params.chainId !== undefined) this.assertChainSupported(params.chainId)

    // A caller-supplied `markets[]` override can narrow the configured
    // allowlist, but normal chain/asset filters still apply afterward.
    const candidates = params.markets ?? this._config.marketAllowlist ?? []
    const allowedMarkets = selectAllowedLendMarkets(candidates, this._config)
    const filteredMarkets = this.filterMarketConfigs(
      allowedMarkets,
      params.chainId,
      params.asset,
    )

    return this._getMarkets({
      asset: params.asset,
      chainId: params.chainId,
      markets: filteredMarkets,
    })
  }

  /**
   * Get position information for a wallet
   * @param walletAddress - User wallet address to check position for
   * @param marketId - Market identifier (required)
   * @param asset - Asset filter (not yet supported)
   * @returns Promise resolving to position information
   */
  async getPosition(
    walletAddress: Address,
    marketId?: LendMarketId,
    asset?: Asset,
  ): Promise<LendMarketPosition> {
    // For now, require marketId (asset-only and empty params not yet supported)
    if (!marketId) {
      throw new MarketIdRequiredError(
        'Querying all positions or by asset is not yet supported.',
      )
    }

    if (asset) {
      throw new MarketIdRequiredError(
        'Filtering by asset is not yet supported. Please provide only marketId.',
      )
    }

    this.validateMarketAllowed(marketId)

    return this._getPosition({ marketId, walletAddress })
  }

  /**
   * Close a lending position (withdraw assets from a market)
   * @description Validates wallet, chain, market allowlist/blocklist, and any
   * caller asset against the resolved market underlying before using the trusted
   * market asset for amount parsing and provider routing.
   * @param params - Market, optional asset, wallet, amount, and withdrawal options
   * @returns Promise resolving to withdrawal transaction details
   * @throws MarketNotAllowedError when the market is not allowlisted, is
   * blocklisted, or the caller asset does not match the market underlying
   */
  async closePosition(params: ClosePositionParams): Promise<LendTransaction> {
    validateWalletAddress(params.walletAddress)

    this.validateMarketAllowed(params.marketId)

    const market = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })

    if (params.asset) {
      validateMarketAsset(market, params.asset)
    }
    const trustedAsset = market.asset

    // Convert human-readable amount to wei using the market asset's decimals.
    const amountWei = parseAssetAmount(trustedAsset, params.amount)

    return this._closePosition({
      asset: trustedAsset,
      amount: amountWei,
      marketId: params.marketId,
      walletAddress: params.walletAddress,
      options: params.options,
    })
  }

  /**
   * Validate that a market is allowed for this provider.
   * @param marketId - Market identifier containing address and chainId
   * @throws MarketNotAllowedError when the market is blocklisted, or when it is
   * absent from the allowlist. An empty/undefined `marketAllowlist` fails closed
   * (permits nothing): the signing path (open/close) then matches the read path.
   * `getVault`/`getReserve` already throw when no allowlist resolves the market,
   * and the borrow surface does the same, so an empty allowlist is never a silent
   * allow-all.
   */
  protected validateMarketAllowed(marketId: LendMarketId): void {
    this.assertChainSupported(marketId.chainId)

    // Blocklist takes precedence: a blocklisted market is rejected even when it
    // also appears in the allowlist.
    if (this._config.marketBlocklist?.length) {
      const blocked = findMatchingConfig({
        configs: this._config.marketBlocklist,
        target: marketId,
        matches: lendMarketIdMatches,
      })
      if (blocked) {
        throw new MarketNotAllowedError({
          address: marketId.address,
          chainId: marketId.chainId,
          reason: 'Market is on the marketBlocklist',
        })
      }
    }

    const foundMarket = findMatchingConfig({
      configs: this._config.marketAllowlist,
      target: marketId,
      matches: lendMarketIdMatches,
    })

    if (!foundMarket) {
      throw new MarketNotAllowedError({
        address: marketId.address,
        chainId: marketId.chainId,
        reason: 'Market is not in the market allowlist',
      })
    }
  }

  /**
   * Build an ERC20 approval transaction
   * @param tokenAddress - Address of the token to approve
   * @param spender - Address to approve spending for
   * @param amount - Amount to approve
   * @returns Transaction data for the approval
   */
  protected buildApprovalTx(
    tokenAddress: Address,
    spender: Address,
    amount: bigint,
  ): TransactionData {
    return buildErc20ApprovalTx({ assetAddress: tokenAddress, spender, amount })
  }

  /**
   * Build the approval transaction for an ERC-20 lend deposit. Caller is
   * expected to skip this for native deposits.
   * @throws if the provider's `_openPosition` result is missing `spender`
   */
  private buildLendApproval(params: BuildLendApprovalParams): TransactionData {
    const { position, approvalMode, amountWei } = params
    if (!position.spender) {
      throw new Error(
        `LendOpenPosition.spender is required for ERC-20 deposits (assetAddress: ${position.assetAddress})`,
      )
    }
    return buildErc20ApprovalTx({
      assetAddress: position.assetAddress,
      spender: position.spender,
      amount: resolveErc20ApprovalAmount(approvalMode, amountWei),
    })
  }

  /**
   * Helper method to filter market configurations
   * @param chainId - Chain ID to filter by
   * @param asset - Asset to filter by
   * @returns Filtered market configurations
   */
  private filterMarketConfigs(
    markets: readonly LendMarketConfig[],
    chainId?: SupportedChainId,
    asset?: Asset,
  ): LendMarketConfig[] {
    return filterMatchingConfigs(markets, [
      chainId === undefined
        ? undefined
        : (market: LendMarketConfig) => market.chainId === chainId,
      asset === undefined
        ? undefined
        : (market: LendMarketConfig) => market.asset === asset,
    ])
  }

  /**
   * Describe a deposit for opening a lending position. Providers describe
   * **what** needs to happen (the spender that needs allowance + the deposit
   * calldata + APY snapshot); the base class owns **how** the approval is
   * built (amount sized via `approvalMode`, native deposits skipped, etc.).
   *
   * Return `spender: undefined` for native-asset deposits where value is sent
   * inline as `msg.value` and no ERC-20 approval is required.
   * @description Must be implemented by providers
   */
  protected abstract _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendOpenPosition>

  /**
   * Provider implementation of getMarket method
   * @description Must be implemented by providers
   */
  protected abstract _getMarket(marketId: LendMarketId): Promise<LendMarket>

  /**
   * Provider implementation of getMarkets method
   * @description Must be implemented by providers
   */
  protected abstract _getMarkets(
    params: GetLendMarketsParams,
  ): Promise<LendMarket[]>

  /**
   * Provider implementation of getPosition method
   * @description Must be implemented by providers
   */
  protected abstract _getPosition(
    params: GetMarketBalanceParams,
  ): Promise<LendMarketPosition>

  /**
   * Provider implementation of closePosition method
   * @description Must be implemented by providers
   */
  protected abstract _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction>
}
