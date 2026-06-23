import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InvalidParamsError } from '@/core/error/errors.js'
import type { TransactionData } from '@/types/transaction.js'
import { executeTransactionBatch } from '@/wallet/core/utils/executeTransactionBatch.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

const CHAIN_ID = 10 as const
const TX_A: TransactionData = {
  to: '0x0000000000000000000000000000000000000001' as Address,
  data: '0xaa',
  value: 0n,
}
const TX_B: TransactionData = {
  to: '0x0000000000000000000000000000000000000002' as Address,
  data: '0xbb',
  value: 0n,
}

describe('executeTransactionBatch', () => {
  let wallet: Wallet

  beforeEach(() => {
    wallet = {
      send: vi.fn().mockResolvedValue({ kind: 'single' }),
      sendBatch: vi.fn().mockResolvedValue({ kind: 'batch' }),
    } as unknown as Wallet
  })

  it('throws when the transaction list is empty', async () => {
    await expect(executeTransactionBatch(wallet, [], CHAIN_ID)).rejects.toThrow(
      InvalidParamsError,
    )
  })

  it('calls wallet.send for a single transaction', async () => {
    const result = await executeTransactionBatch(wallet, [TX_A], CHAIN_ID)
    expect(wallet.send).toHaveBeenCalledWith(TX_A, CHAIN_ID)
    expect(wallet.sendBatch).not.toHaveBeenCalled()
    expect(result).toEqual({ kind: 'single' })
  })

  it('calls wallet.sendBatch for multiple transactions', async () => {
    const result = await executeTransactionBatch(wallet, [TX_A, TX_B], CHAIN_ID)
    expect(wallet.sendBatch).toHaveBeenCalledWith([TX_A, TX_B], CHAIN_ID)
    expect(wallet.send).not.toHaveBeenCalled()
    expect(result).toEqual({ kind: 'batch' })
  })

  it('rejects a transaction whose target is the zero address', async () => {
    const zeroTarget: TransactionData = {
      to: '0x0000000000000000000000000000000000000000' as Address,
      data: '0xaa',
      value: 0n,
    }

    await expect(
      executeTransactionBatch(wallet, [zeroTarget], CHAIN_ID),
    ).rejects.toThrow(/cannot be the zero address/)
    expect(wallet.send).not.toHaveBeenCalled()
    expect(wallet.sendBatch).not.toHaveBeenCalled()
  })
})
