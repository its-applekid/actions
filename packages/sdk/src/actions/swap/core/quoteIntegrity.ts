import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

import {
  ActionsError,
  InvalidParamsError,
  QuoteCalldataRecipientMismatchError,
  QuoteExecutionMismatchError,
} from '@/core/error/errors.js'

/**
 * Convert malformed calldata decoder failures into stable SDK validation errors.
 */
export function decodeQuoteCalldata<T>(params: {
  decode: () => T
  expected: string
}): T {
  try {
    return params.decode()
  } catch (error: unknown) {
    if (error instanceof ActionsError) throw error
    throw new InvalidParamsError({
      param: 'swapCalldata',
      expected: params.expected,
      received: describeDecodeFailure(error),
    })
  }
}

export function assertQuoteCalldataRecipient(params: {
  expectedRecipient: Address
  calldataRecipient: Address
}): void {
  if (isAddressEqual(params.calldataRecipient, params.expectedRecipient)) return
  throw new QuoteCalldataRecipientMismatchError({
    calldataRecipient: params.calldataRecipient,
    walletAddress: params.expectedRecipient,
  })
}

export function assertQuoteExecutionAddress(params: {
  field: string
  expected: Address
  received: Address
}): void {
  if (isAddressEqual(params.received, params.expected)) return
  throwQuoteExecutionMismatch({
    field: params.field,
    expected: params.expected,
    received: params.received,
  })
}

export function assertQuoteExecutionValue(params: {
  field: string
  expected: bigint
  received: bigint
}): void {
  if (params.received === params.expected) return
  throwQuoteExecutionMismatch({
    field: params.field,
    expected: params.expected.toString(),
    received: params.received.toString(),
  })
}

export function assertQuoteExecutionField(params: {
  field: string
  expected: string | number | boolean
  received: string | number | boolean
}): void {
  if (params.received === params.expected) return
  throwQuoteExecutionMismatch({
    field: params.field,
    expected: String(params.expected),
    received: String(params.received),
  })
}

function throwQuoteExecutionMismatch(params: {
  field: string
  expected: string
  received: string
}): never {
  throw new QuoteExecutionMismatchError(params)
}

function describeDecodeFailure(error: unknown): string {
  if (error instanceof Error) return error.name
  return typeof error === 'string' ? error : 'unknown decode failure'
}
