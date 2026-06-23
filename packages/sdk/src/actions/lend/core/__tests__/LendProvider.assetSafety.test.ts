import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type {
  ClosePositionParams,
  LendClosePositionParams,
  LendMarketConfig,
  LendMarketId,
  LendOpenPosition,
  LendOpenPositionInternalParams,
  LendOpenPositionParams,
  LendTransaction,
} from '@/types/lend/index.js'

const MARKET_ASSET = '0x0000000000000000000000000000000000000001' as Address
const VAULT = '0x2222222222222222222222222222222222222222' as Address
const WETH = '0x4200000000000000000000000000000000000006' as Address
const WALLET = '0x3333333333333333333333333333333333333333' as Address

const assetAt = (address: Address): Asset => ({
  address: { 84532: address },
  metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  type: 'erc20',
})

const marketConfig = (address: Address): LendMarketConfig => ({
  address,
  chainId: 84532,
  name: 'Configured Market',
  asset: assetAt(MARKET_ASSET),
  lendProvider: 'morpho',
})

class RecordingLendProvider extends MockLendProvider {
  public openCalls: LendOpenPositionInternalParams[] = []
  public closeCalls: LendClosePositionParams[] = []

  protected override async _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendOpenPosition> {
    this.openCalls.push(params)
    return super._openPosition(params)
  }

  protected override async _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction> {
    this.closeCalls.push(params)
    return super._closePosition(params)
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

describe('LendProvider market asset safety', () => {
  const marketId: LendMarketId = { address: VAULT, chainId: 84532 }

  it('throws before provider routing when caller asset does not match the market underlying', async () => {
    const provider = new RecordingLendProvider({
      marketAllowlist: [marketConfig(VAULT)],
    })

    await expect(
      callOpen(provider, {
        amount: 1000,
        asset: assetAt(WETH),
        marketId,
        walletAddress: WALLET,
        approvalMode: 'max',
      }),
    ).rejects.toBeInstanceOf(MarketNotAllowedError)
    expect(provider.openCalls).toEqual([])
  })

  it('succeeds and approves the correct token when caller asset matches the market underlying', async () => {
    const provider = new RecordingLendProvider({
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

  it('uses trusted market asset decimals when caller metadata is spoofed', async () => {
    const provider = new RecordingLendProvider({
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
    expect(provider.openCalls[0].asset.metadata.decimals).toBe(18)
  })

  it('uses trusted market asset type when caller type is spoofed', async () => {
    const provider = new RecordingLendProvider({
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
    expect(provider.openCalls[0].asset.type).toBe('erc20')
  })

  it('passes trusted market asset to closePosition when caller metadata and type are spoofed', async () => {
    const provider = new RecordingLendProvider({
      marketAllowlist: [marketConfig(VAULT)],
    })
    const spoofedAsset: Asset = {
      ...assetAt(MARKET_ASSET),
      metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      type: 'native',
    }

    const result = await callClose(provider, {
      amount: 1,
      asset: spoofedAsset,
      marketId,
      walletAddress: WALLET,
    })

    expect(result.amount).toBe(1_000_000_000_000_000_000n)
    expect(result.assetAddress).toBe(MARKET_ASSET)
    expect(provider.closeCalls[0].asset?.metadata.decimals).toBe(18)
    expect(provider.closeCalls[0].asset?.type).toBe('erc20')
  })
})
