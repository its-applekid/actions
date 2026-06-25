import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'

/**
 * Assert a decoded swap address equals the trusted address.
 * Uses viem-normalized equality so checksum differences cannot false-mismatch.
 * @throws QuoteCalldataMismatchError when the decoded address differs.
 */
export function assertSwapAddressField(
  field: string,
  actual: Address,
  expected: Address,
): void {
  if (isAddressEqual(actual, expected)) return
  throw new QuoteCalldataMismatchError({ field, expected, received: actual })
}

/**
 * Assert a decoded swap amount equals the trusted raw amount.
 * Optional actual values let exact-input/output structs share this helper.
 * @throws QuoteCalldataMismatchError when the decoded amount differs.
 */
export function assertSwapAmountField(
  field: string,
  actual: bigint | undefined,
  expected: bigint,
): void {
  if (actual === expected) return
  throw new QuoteCalldataMismatchError({
    field,
    expected: expected.toString(),
    received: actual?.toString(),
  })
}

/**
 * Assert a decoded swap deadline equals the quote deadline.
 * Centralizes the quote number to calldata bigint conversion.
 * @throws QuoteCalldataMismatchError when the decoded deadline differs.
 */
export function assertSwapDeadlineField(
  quote: Pick<SwapQuote, 'deadline'>,
  actual: bigint,
): void {
  assertSwapAmountField('deadline', actual, BigInt(quote.deadline))
}
