import { describe, expect, it } from 'vitest'

import { ETH } from '@/constants/assets.js'
import {
  CHAIN_ID,
  createPublicClientMock,
  createReceipt,
  TEST_TOKEN,
  TX_HASH,
  WALLET_ADDRESS,
} from '@/utils/anvilE2E/__tests__/fixtures.js'
import {
  assertSuccessfulReceipts,
  ForkE2EReceiptError,
  getSnapshotBalance,
  snapshotTokenBalances,
} from '@/utils/anvilE2E/index.js'

describe('anvilE2E balance and receipt helpers', () => {
  it('snapshots native and ERC-20 balances in input order', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [3n],
      tokenBalances: [5n],
    })

    const snapshot = await snapshotTokenBalances(
      { chainId: CHAIN_ID, publicClient },
      WALLET_ADDRESS,
      [TEST_TOKEN, ETH],
    )

    expect(snapshot.balances.map((entry) => entry.balanceRaw)).toEqual([5n, 3n])
    expect(getSnapshotBalance(snapshot, TEST_TOKEN)).toBe(5n)
    expect(getSnapshotBalance(snapshot, ETH)).toBe(3n)
  })

  it('throws when a receipt is mined but reverted', () => {
    expect(() =>
      assertSuccessfulReceipts([
        createReceipt('success', TX_HASH),
        createReceipt('reverted', TX_HASH),
      ]),
    ).toThrow(ForkE2EReceiptError)
  })
})
