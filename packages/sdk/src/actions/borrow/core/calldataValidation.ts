import type { Address } from 'viem'
import { isAddressEqual, maxUint256 } from 'viem'

import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { BorrowAction } from '@/types/borrow/index.js'

/**
 * Assert a decoded protocol call is valid for the quote action.
 * @description Used by borrow calldata decoders after ABI decoding to bind a
 * protocol function selector to the sidecar quote action.
 * @param actual - Action implied by the decoded transaction leg.
 * @param expected - Actions that may emit this leg.
 * @param field - Field name reported when the action is invalid.
 * @returns Nothing when the decoded action is allowed.
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
 * @description Address comparisons use viem's normalized equality so checksum
 * differences cannot produce false mismatches.
 * @param field - Field name reported when the address differs.
 * @param actual - Address decoded from calldata.
 * @param expected - Trusted address from SDK config or wallet context.
 * @returns Nothing when the addresses match.
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
 * @description `{ allowMax: true }` permits `maxUint256` for protocol-native
 * max repay or withdraw sentinels while still rejecting unrelated values.
 * @param field - Field name reported when the amount differs.
 * @param actual - Amount decoded from calldata.
 * @param expected - Trusted raw amount from the quote, when the leg has one.
 * @param options - Optional sentinel allowance for max operations.
 * @returns Nothing when the amount matches the quote or allowed sentinel.
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
 * Throw the shared calldata mismatch error.
 * @description Centralizes error construction so provider decoders report the
 * same error class and metadata shape for all byte/metadata divergence.
 * @param field - Field whose decoded value diverged.
 * @param params - Optional expected, received, or explanatory detail strings.
 * @returns Never returns.
 * @throws QuoteCalldataMismatchError always.
 */
export function failCalldata(
  field: string,
  params: { expected?: string; received?: string; detail?: string },
): never {
  throw new QuoteCalldataMismatchError({ field, ...params })
}
