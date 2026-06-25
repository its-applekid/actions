import { describe, expect, it, vi } from 'vitest'

import type { BorrowReceipt } from '@/types/borrow/index.js'
import {
  CHAIN_ID,
  createBorrowMarket,
  createBorrowReceipt,
  createPublicClientMock,
  TEST_TOKEN,
  WALLET_ADDRESS,
} from '@/utils/anvil/__tests__/fixtures.js'
import {
  ForkE2EConfigError,
  getSnapshotBalance,
  runForkBorrowProviderE2E,
} from '@/utils/anvil/index.js'
import type {
  ForkBorrowActionScenario,
  ForkBorrowTarget,
} from '@/utils/anvil/types.js'

describe('anvil borrow action runner', () => {
  it.each(createBorrowCases())(
    'runs a borrow $scenario.action scenario through the public wallet namespace',
    async ({ method, scenario }) => {
      const publicClient = createPublicClientMock({
        ethBalances: [3n, 8n],
        tokenBalances: [50n, 40n],
      })
      const receipt = createBorrowReceipt()
      const borrow = createBorrowNamespace(receipt)
      const wallet = { address: WALLET_ADDRESS, borrow }

      const result = await runForkBorrowProviderE2E(wallet, {
        borrow: scenario,
        chainId: CHAIN_ID,
        publicClient,
      })

      expect(borrow[method]).toHaveBeenCalledOnce()
      expect(result.result).toBe(receipt)
      expect(getSnapshotBalance(result.after, TEST_TOKEN)).toBe(40n)
    },
  )

  it('throws when a borrow namespace is missing', async () => {
    await expect(
      runForkBorrowProviderE2E(
        { address: WALLET_ADDRESS },
        {
          borrow: createBorrowCases()[0].scenario,
          chainId: CHAIN_ID,
          publicClient: createPublicClientMock({
            ethBalances: [],
            tokenBalances: [],
          }),
        },
      ),
    ).rejects.toThrow(ForkE2EConfigError)
  })
})

function createBorrowCases(): Array<{
  method: keyof NonNullable<ForkBorrowTarget['borrow']>
  scenario: ForkBorrowActionScenario
}> {
  const market = createBorrowMarket()
  return [
    {
      method: 'openPosition',
      scenario: {
        action: 'open',
        params: {
          borrowAmount: { amount: 5 },
          collateralAmount: { amount: 10 },
          market,
        },
      },
    },
    {
      method: 'closePosition',
      scenario: {
        action: 'close',
        params: {
          borrowAmount: { max: true },
          collateralAmount: { max: true },
          market,
        },
      },
    },
    {
      method: 'depositCollateral',
      scenario: {
        action: 'depositCollateral',
        params: { amount: { amount: 5 }, market },
      },
    },
    {
      method: 'withdrawCollateral',
      scenario: {
        action: 'withdrawCollateral',
        params: { amount: { amount: 5 }, market },
      },
    },
    {
      method: 'repay',
      scenario: {
        action: 'repay',
        params: { amount: { amount: 5 }, market },
      },
    },
  ]
}

function createBorrowNamespace(
  receipt: BorrowReceipt,
): NonNullable<ForkBorrowTarget['borrow']> {
  return {
    closePosition: vi.fn().mockResolvedValue(receipt),
    depositCollateral: vi.fn().mockResolvedValue(receipt),
    openPosition: vi.fn().mockResolvedValue(receipt),
    repay: vi.fn().mockResolvedValue(receipt),
    withdrawCollateral: vi.fn().mockResolvedValue(receipt),
  }
}
