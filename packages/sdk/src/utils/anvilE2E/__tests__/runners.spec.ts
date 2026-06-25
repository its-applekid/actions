import { describe, expect, it, vi } from 'vitest'

import { ETH } from '@/constants/assets.js'
import {
  CHAIN_ID,
  createBorrowMarket,
  createBorrowReceipt,
  createPublicClientMock,
  createReceipt,
  createSwapReceipt,
  TEST_TOKEN,
  TOKEN_ADDRESS,
  TX_HASH,
  WALLET_ADDRESS,
} from '@/utils/anvilE2E/__tests__/fixtures.js'
import {
  getSnapshotBalance,
  runForkBorrowProviderE2E,
  runForkLendProviderE2E,
  runForkSwapProviderE2E,
  runForkWalletSendE2E,
} from '@/utils/anvilE2E/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

describe('anvilE2E action runners', () => {
  it('runs a wallet send scenario through the public wallet API', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [10n, 9n],
      tokenBalances: [],
    })
    const receipt = createReceipt('success', TX_HASH)
    const send = vi.fn().mockResolvedValue(receipt)
    const wallet = { address: WALLET_ADDRESS, send } as unknown as Wallet

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
    } as unknown as Wallet

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

  it('runs a lend scenario through the public wallet namespace', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [],
      tokenBalances: [20n, 15n],
    })
    const receipt = createReceipt('success', TX_HASH)
    const openPosition = vi.fn().mockResolvedValue(receipt)
    const wallet = {
      address: WALLET_ADDRESS,
      lend: { openPosition },
    } as unknown as Wallet

    const result = await runForkLendProviderE2E(wallet, {
      chainId: CHAIN_ID,
      lend: {
        params: {
          amount: 5,
          asset: TEST_TOKEN,
          marketId: { address: TOKEN_ADDRESS, chainId: CHAIN_ID },
        },
      },
      publicClient,
    })

    expect(openPosition).toHaveBeenCalledOnce()
    expect(result.result).toBe(receipt)
    expect(getSnapshotBalance(result.after, TEST_TOKEN)).toBe(15n)
  })

  it('runs a borrow scenario through the public wallet namespace', async () => {
    const publicClient = createPublicClientMock({
      ethBalances: [3n, 8n],
      tokenBalances: [50n, 40n],
    })
    const receipt = createBorrowReceipt()
    const openPosition = vi.fn().mockResolvedValue(receipt)
    const wallet = {
      address: WALLET_ADDRESS,
      borrow: { openPosition },
    } as unknown as Wallet

    const result = await runForkBorrowProviderE2E(wallet, {
      borrow: {
        action: 'open',
        params: {
          borrowAmount: { amount: 5 },
          collateralAmount: { amount: 10 },
          market: createBorrowMarket(),
        },
      },
      chainId: CHAIN_ID,
      publicClient,
    })

    expect(openPosition).toHaveBeenCalledOnce()
    expect(result.result).toBe(receipt)
    expect(getSnapshotBalance(result.after, TEST_TOKEN)).toBe(40n)
  })
})
