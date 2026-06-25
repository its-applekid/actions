import type { Hex } from 'viem'

import { ForkE2EReceiptError } from '@/utils/anvilE2E/errors.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
  UserOperationTransactionReceipt,
} from '@/wallet/core/wallets/abstract/types/index.js'

type ReceiptStatus = 'success' | 'reverted'

interface ReceiptMeta {
  hash?: Hex
  status?: ReceiptStatus
}

/**
 * Assert that every receipt in a wallet receipt union succeeded.
 * @description Accepts the receipt shapes returned by EOA sends, EOA batches,
 * and ERC-4337 user operation sends.
 * @param receipt - Wallet receipt or receipt batch to inspect.
 * @returns The input receipt after success validation.
 * @throws ForkE2EReceiptError when any receipt is missing or reverted.
 */
export function assertSuccessfulReceipts<
  TReceipt extends TransactionReturnType | BatchTransactionReturnType,
>(receipt: TReceipt): TReceipt {
  const receipts = Array.isArray(receipt) ? receipt : [receipt]
  for (const item of receipts) assertSuccessfulReceipt(item)
  return receipt
}

function assertSuccessfulReceipt(receipt: TransactionReturnType): void {
  const meta = getReceiptMeta(receipt)
  if (meta.status !== 'success') throw new ForkE2EReceiptError(meta)
}

function getReceiptMeta(receipt: TransactionReturnType): ReceiptMeta {
  if ('status' in receipt) {
    return { hash: receipt.transactionHash, status: receipt.status }
  }
  return getUserOperationReceiptMeta(receipt)
}

function getUserOperationReceiptMeta(
  receipt: UserOperationTransactionReceipt,
): ReceiptMeta {
  return {
    hash: receipt.receipt.transactionHash ?? receipt.userOpHash,
    status: receipt.receipt.status,
  }
}
