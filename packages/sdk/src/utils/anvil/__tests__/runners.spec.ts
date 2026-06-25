import { describe, expect, it, vi } from 'vitest'

import { ETH } from '@/constants/assets.js'
import type { LendTransactionReceipt } from '@/types/lend/index.js'
import {
  CHAIN_ID,
  createPublicClientMock,
  createReceipt,
  createSwapReceipt,
  TEST_TOKEN,
  TOKEN_ADDRESS,
  TX_HASH,
  WALLET_ADDRESS,
} from '@/utils/anvil/__tests__/fixtures.js'
import {
  ForkE2EConfigError,
  getSnapshotBalance,
  runForkLendProviderE2E,
  runForkSwapProviderE2E,
  runForkWalletBatchSendE2E,
  runForkWalletSendE2E,
} from '@/utils/anvil/index.js'
import type { ForkLendTarget } from '@/utils/anvil/types.js'

describe('anvil action runners', () => {
  it('runs a wallet send scenario through the public wallet API', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [10n, 9n],
      tokenBalances: [],
    })
    const receipt = createReceipt('success', TX_HASH)
    const send = vi.fn().mockResolvedValue(receipt)
    const wallet = { address: WALLET_ADDRESS, send }

    const result = await runForkWalletSendE2E(wallet, {
      balanceAssets: [ETH],
      chainId: CHAIN_ID,
      publicClient,
      transaction: { data: '0x', to: TOKEN_ADDRESS, value: 1n },
    })

    expect(send).toHaveBeenCalledWith(
      { data: '0x', to: TOKEN_ADDRESS, value: 1n },
      CHAIN_ID,
    )
    expect(result.result).toBe(receipt)
    expect(getSnapshotBalance(result.after, ETH)).toBe(9n)
  })

  it('runs a wallet batch-send scenario through the public wallet API', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [10n, 8n],
      tokenBalances: [],
    })
    const receipts = [
      createReceipt('success', TX_HASH),
      createReceipt('success', TX_HASH),
    ]
    const sendBatch = vi.fn().mockResolvedValue(receipts)
    const wallet = { address: WALLET_ADDRESS, sendBatch }
    const transactions = [
      { data: '0x', to: TOKEN_ADDRESS, value: 1n },
      { data: '0x', to: TOKEN_ADDRESS, value: 1n },
    ] as const

    const result = await runForkWalletBatchSendE2E(wallet, {
      balanceAssets: [ETH],
      chainId: CHAIN_ID,
      publicClient,
      transactions,
    })

    expect(sendBatch).toHaveBeenCalledWith(transactions, CHAIN_ID)
    expect(result.result).toBe(receipts)
    expect(getSnapshotBalance(result.after, ETH)).toBe(8n)
  })

  it('runs a swap scenario through the public wallet namespace', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [10n, 12n],
      tokenBalances: [20n, 18n],
    })
    const swapReceipt = createSwapReceipt()
    const execute = vi.fn().mockResolvedValue(swapReceipt)
    const wallet = {
      address: WALLET_ADDRESS,
      swap: { execute },
    }

    const result = await runForkSwapProviderE2E(wallet, {
      chainId: CHAIN_ID,
      publicClient,
      swap: {
        amountIn: 2,
        assetIn: TEST_TOKEN,
        assetOut: ETH,
        chainId: CHAIN_ID,
      },
    })

    expect(execute).toHaveBeenCalledOnce()
    expect(result.result).toBe(swapReceipt)
    expect(getSnapshotBalance(result.before, TEST_TOKEN)).toBe(20n)
    expect(getSnapshotBalance(result.after, TEST_TOKEN)).toBe(18n)
    expect(getSnapshotBalance(result.after, ETH)).toBe(12n)
  })

  it.each([
    { action: 'open' as const, method: 'openPosition' as const },
    { action: 'close' as const, method: 'closePosition' as const },
  ])(
    'runs a lend $action scenario through the public wallet namespace',
    async ({ action, method }) => {
      const publicClient = createPublicClientMock({
        ethBalances: [],
        tokenBalances: [20n, 15n],
      })
      const receipt = createReceipt('success', TX_HASH)
      const lend = createLendNamespace(receipt)
      const wallet = { address: WALLET_ADDRESS, lend }

      const result = await runForkLendProviderE2E(wallet, {
        chainId: CHAIN_ID,
        lend: {
          action,
          params: {
            amount: 5,
            asset: TEST_TOKEN,
            marketId: { address: TOKEN_ADDRESS, chainId: CHAIN_ID },
          },
        },
        publicClient,
      })

      expect(lend[method]).toHaveBeenCalledOnce()
      expect(result.result).toBe(receipt)
      expect(getSnapshotBalance(result.after, TEST_TOKEN)).toBe(15n)
    },
  )

  it('throws when a swap namespace is missing', async () => {
    await expect(
      runForkSwapProviderE2E(
        { address: WALLET_ADDRESS },
        {
          chainId: CHAIN_ID,
          publicClient: createEmptyClient(),
          swap: {
            amountIn: 2,
            assetIn: TEST_TOKEN,
            assetOut: ETH,
            chainId: CHAIN_ID,
          },
        },
      ),
    ).rejects.toThrow(ForkE2EConfigError)
  })

  it('throws when a lend namespace is missing', async () => {
    await expect(
      runForkLendProviderE2E(
        { address: WALLET_ADDRESS },
        {
          chainId: CHAIN_ID,
          lend: { params: createLendParams() },
          publicClient: createEmptyClient(),
        },
      ),
    ).rejects.toThrow(ForkE2EConfigError)
  })
})

function createLendParams() {
  return {
    amount: 5,
    asset: TEST_TOKEN,
    marketId: { address: TOKEN_ADDRESS, chainId: CHAIN_ID },
  }
}

function createEmptyClient() {
  return createPublicClientMock({ ethBalances: [], tokenBalances: [] })
}

function createLendNamespace(
  receipt: LendTransactionReceipt,
): NonNullable<ForkLendTarget['lend']> {
  return {
    closePosition: vi.fn().mockResolvedValue(receipt),
    openPosition: vi.fn().mockResolvedValue(receipt),
  }
}
