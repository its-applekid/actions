import type { Address } from 'viem'
import { isAddressEqual, maxUint256 } from 'viem'

import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { BorrowAction, BorrowQuote } from '@/types/borrow/index.js'

/**
 * Assert a decoded protocol call is valid for the quote action.
 * @throws QuoteCalldataMismatchError when the leg is not valid for the quote.
 */
export function assertBorrowAction(
  actual: BorrowAction,
  expected: readonly BorrowAction[],
  field: string,
): void {
  if (expected.includes(actual)) return
  failCalldata(field, { expected: expected.join(' or '), received: actual })
}

/**
 * Assert a decoded address equals the trusted address.
 * Uses viem-normalized equality so checksum differences cannot false-mismatch.
 * @throws QuoteCalldataMismatchError when the decoded address differs.
 */
export function assertAddressField(
  field: string,
  actual: Address,
  expected: Address,
): void {
  if (isAddressEqual(actual, expected)) return
  failCalldata(field, { expected, received: actual })
}

/**
 * Assert a decoded amount equals the trusted quote amount.
 * `{ allowMax: true }` permits protocol-native max-operation sentinels.
 * @throws QuoteCalldataMismatchError when the decoded amount differs.
 */
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

/**
 * Assert a counted transaction leg appears the expected number of times.
 * @throws QuoteCalldataMismatchError when the count differs.
 */
export function assertCountField(
  field: string,
  actual: number,
  expected: number,
): void {
  if (actual === expected) return
  failCalldata(field, {
    expected: String(expected),
    received: String(actual),
  })
}

/**
 * Build a zeroed operation summary for bundle-shape validation.
 * @returns A mutable count record keyed by operation name.
 */
export function emptyOperationSummary<Operation extends string>(
  operations: readonly Operation[],
): Record<Operation, number> {
  const summary = {} as Record<Operation, number>
  for (const operation of operations) summary[operation] = 0
  return summary
}

/**
 * Check whether a borrow quote carries collateral.
 * @returns True when the quote includes a positive raw collateral amount.
 */
export function quoteHasCollateral(
  quote: Pick<BorrowQuote, 'collateralAmountRaw'>,
): boolean {
  return (quote.collateralAmountRaw ?? 0n) > 0n
}

/**
 * Throw the shared calldata mismatch error.
 * @throws QuoteCalldataMismatchError always.
 */
export function failCalldata(
  field: string,
  params: { expected?: string; received?: string; detail?: string },
): never {
  throw new QuoteCalldataMismatchError({ field, ...params })
}
