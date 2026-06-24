import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'

/**
 * Assert a decoded swap address equals the trusted address.
 * @description Address comparisons use viem's normalized equality so checksum
 * differences cannot produce false mismatches.
 * @param field - Field name reported when the address differs.
 * @param actual - Address decoded from calldata.
 * @param expected - Trusted address from quote metadata or provider config.
 * @returns Nothing when the addresses match.
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
 * @description Optional actual values are allowed so exact-input and
 * exact-output structs can share the same assertion helper.
 * @param field - Field name reported when the amount differs.
 * @param actual - Amount decoded from calldata.
 * @param expected - Trusted raw amount from quote metadata.
 * @returns Nothing when the amounts match.
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
 * @description Quote deadlines are human-readable numbers while calldata uses
 * bigint, so this helper centralizes the explicit conversion.
 * @param quote - Quote carrying the trusted deadline.
 * @param actual - Deadline decoded from calldata.
 * @returns Nothing when the deadline matches.
 * @throws QuoteCalldataMismatchError when the decoded deadline differs.
 */
export function assertSwapDeadlineField(
  quote: Pick<SwapQuote, 'deadline'>,
  actual: bigint,
): void {
  assertSwapAmountField('deadline', actual, BigInt(quote.deadline))
}
