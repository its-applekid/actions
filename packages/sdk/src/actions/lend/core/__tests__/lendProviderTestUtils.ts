import type { Address } from 'viem'

import type { MockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { LendProvider } from '@/actions/lend/core/LendProvider.js'
import type { Asset } from '@/types/asset.js'
import type {
  ClosePositionParams,
  GetLendMarketsParams,
  LendMarket,
  LendMarketConfig,
  LendOpenPositionParams,
  LendTransaction,
} from '@/types/lend/index.js'

export const LEND_TEST_CHAIN_ID = 84532

// MockLendProvider reports this market underlying on every chain.
export const LEND_TEST_MARKET_ASSET =
  '0x0000000000000000000000000000000000000001' as Address

export const assetAt = (address: Address): Asset => ({
  address: { [LEND_TEST_CHAIN_ID]: address },
  metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  type: 'erc20',
})

export const marketConfig = (
  address: Address,
  overrides: Partial<Pick<LendMarketConfig, 'asset' | 'chainId'>> = {},
): LendMarketConfig => ({
  address,
  chainId: overrides.chainId ?? LEND_TEST_CHAIN_ID,
  name: 'Configured Market',
  asset: overrides.asset ?? assetAt(LEND_TEST_MARKET_ASSET),
  lendProvider: 'morpho',
})

// MockLendProvider spies on public methods, so call prototypes to exercise base flows.
export const callOpen = (
  provider: MockLendProvider,
  params: LendOpenPositionParams,
): Promise<LendTransaction> =>
  LendProvider.prototype.openPosition.call(
    provider,
    params,
  ) as Promise<LendTransaction>

export const callClose = (
  provider: MockLendProvider,
  params: ClosePositionParams,
): Promise<LendTransaction> =>
  LendProvider.prototype.closePosition.call(
    provider,
    params,
  ) as Promise<LendTransaction>

export const callGetMarkets = (
  provider: MockLendProvider,
  params: GetLendMarketsParams = {},
): Promise<LendMarket[]> =>
  LendProvider.prototype.getMarkets.call(provider, params) as Promise<
    LendMarket[]
  >
