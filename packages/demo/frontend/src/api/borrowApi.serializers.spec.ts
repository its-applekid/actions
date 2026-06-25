import type {
  Address,
  Asset,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowQuote,
} from '@eth-optimism/actions-sdk'
import { describe, expect, it } from 'vitest'

import type { Serialized } from '../util/serialize'
import { deserializeQuote } from './borrowApi.serializers'

const CHAIN_ID = 10
const WALLET: Address = '0x1234567890123456789012345678901234567890'
const MARKET_ID: BorrowMarketId = {
  kind: 'morpho-blue',
  chainId: CHAIN_ID,
  marketId: '0x01',
}
const ASSET: Asset = {
  address: { [CHAIN_ID]: '0x0000000000000000000000000000000000000001' },
  metadata: { decimals: 18, name: 'Token', symbol: 'TOK' },
  type: 'erc20',
}

function position(): Serialized<BorrowMarketPosition> {
  return {
    marketId: MARKET_ID,
    collateralAsset: ASSET,
    collateralShares: '0',
    borrowAsset: ASSET,
    borrowAmount: '0',
    borrowAmountFormatted: '0',
    healthFactor: null,
    liquidationPrice: '0',
    liquidationPriceFormatted: '0',
    borrowApy: 0,
    liquidationBonus: 0,
    ltv: null,
    maxLtv: 0.86,
  }
}

describe('borrowApi serializers', () => {
  it('restores raw execution bigint fields on borrow quotes', () => {
    const quote: Serialized<BorrowQuote> = {
      marketId: MARKET_ID,
      recipient: WALLET,
      action: 'repay',
      borrowAmountRaw: '123',
      positionBefore: position(),
      positionAfter: position(),
      fees: { borrowApy: 0, liquidationBonus: 0 },
      safeCeilingLtv: 0.8,
      execution: {
        transactions: [
          {
            to: '0x0000000000000000000000000000000000000002',
            data: '0x1234',
            value: '0',
          },
        ],
        approvalsSkipped: true,
        providerContext: { repaySharesRaw: '456' },
      },
      provider: 'morpho',
      quotedAt: 1,
      expiresAt: 2,
      gasEstimate: '3',
    }

    const deserialized = deserializeQuote(quote)

    expect(deserialized.execution.transactions[0]?.value).toBe(0n)
    expect(deserialized.execution.providerContext?.repaySharesRaw).toBe(456n)
    expect(deserialized.borrowAmountRaw).toBe(123n)
    expect(deserialized.gasEstimate).toBe(3n)
  })
})
