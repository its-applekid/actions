import type { Address } from 'viem'
import { isAddressEqual, maxUint256 } from 'viem'

import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { BorrowAction } from '@/types/borrow/index.js'

export function assertBorrowAction(
  actual: BorrowAction,
  expected: readonly BorrowAction[],
  field: string,
): void {
  if (expected.includes(actual)) return
  failCalldata(field, { expected: expected.join(' or '), received: actual })
}

export function assertAddressField(
  field: string,
  actual: Address,
  expected: Address,
): void {
  if (isAddressEqual(actual, expected)) return
  failCalldata(field, { expected, received: actual })
}

export function assertAmountField(
  field: string,
  actual: bigint,
  expected: bigint | undefined,
  options: { allowMax?: boolean } = {},
): void {
  if (expected !== undefined && actual === expected) return
  if (options.allowMax && actual === maxUint256) return
  failCalldata(field, {
    expected: expected?.toString(),
    received: actual.toString(),
  })
}

export function failCalldata(
  field: string,
  params: { expected?: string; received?: string; detail?: string },
): never {
  throw new QuoteCalldataMismatchError({ field, ...params })
}
