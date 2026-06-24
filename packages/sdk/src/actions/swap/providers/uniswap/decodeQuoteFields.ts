import type { Address, Hex } from 'viem'
import { decodeAbiParameters, isAddressEqual, zeroAddress } from 'viem'

import { CURRENCY_AMOUNT_PARAMS } from '@/actions/swap/providers/uniswap/abis.js'
import { computeMaxInput } from '@/actions/swap/providers/uniswap/encoding.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

export interface UniswapSwapParams {
  poolKey: {
    currency0: Address
    currency1: Address
    fee: number
    tickSpacing: number
    hooks: Address
  }
  zeroForOne: boolean
  amountIn?: bigint
  amountOut?: bigint
  amountOutMinimum?: bigint
  amountInMaximum?: bigint
}

export interface ExpectedUniswapPool {
  fee: number
  tickSpacing: number
  hooks?: Address
}

export function assertUniswapQuoteFields(
  quote: SwapQuote,
  swapParams: UniswapSwapParams,
  isExactIn: boolean,
  settleParam: Hex,
  takeParam: Hex,
  expectedPool: ExpectedUniswapPool,
): bigint {
  const tokenIn = currencyAddress(quote.assetIn, quote.chainId)
  const tokenOut = currencyAddress(quote.assetOut, quote.chainId)
  assertPoolMatchesQuote(tokenIn, tokenOut, swapParams, expectedPool)
  const expectedInput = isExactIn
    ? quote.amountInRaw
    : computeMaxInput(quote.amountInRaw, quote.slippage)
  assertSwapAmounts(quote, swapParams, isExactIn, expectedInput)
  assertCurrencyAmount('settle', settleParam, tokenIn, expectedInput)
  const expectedOutput = isExactIn ? quote.amountOutMinRaw : quote.amountOutRaw
  assertCurrencyAmount('take', takeParam, tokenOut, expectedOutput)
  return expectedInput
}

function assertSwapAmounts(
  quote: SwapQuote,
  swapParams: UniswapSwapParams,
  isExactIn: boolean,
  expectedInput: bigint,
): void {
  if (isExactIn) {
    assertAmount('amountIn', swapParams.amountIn, quote.amountInRaw)
    assertAmount(
      'amountOutMinimum',
      swapParams.amountOutMinimum,
      quote.amountOutMinRaw,
    )
    return
  }
  assertAmount('amountOut', swapParams.amountOut, quote.amountOutRaw)
  assertAmount('amountInMaximum', swapParams.amountInMaximum, expectedInput)
}

function assertCurrencyAmount(
  field: string,
  data: Hex,
  expectedCurrency: Address,
  expectedAmount: bigint,
): void {
  try {
    const [currency, amount] = decodeAbiParameters(CURRENCY_AMOUNT_PARAMS, data)
    assertAddress(`${field} currency`, currency, expectedCurrency)
    assertAmount(`${field} amount`, amount, expectedAmount)
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    throw new QuoteCalldataMismatchError({
      field,
      detail: `unable to decode ${field} currency amount`,
    })
  }
}

function assertPoolMatchesQuote(
  tokenIn: Address,
  tokenOut: Address,
  swapParams: UniswapSwapParams,
  expectedPool: ExpectedUniswapPool,
): void {
  const [expected0, expected1] =
    tokenIn.toLowerCase() < tokenOut.toLowerCase()
      ? [tokenIn, tokenOut]
      : [tokenOut, tokenIn]
  assertAddress('poolKey currency0', swapParams.poolKey.currency0, expected0)
  assertAddress('poolKey currency1', swapParams.poolKey.currency1, expected1)
  assertNumber('poolKey fee', swapParams.poolKey.fee, expectedPool.fee)
  assertNumber(
    'poolKey tickSpacing',
    swapParams.poolKey.tickSpacing,
    expectedPool.tickSpacing,
  )
  assertAddress(
    'poolKey hooks',
    swapParams.poolKey.hooks,
    expectedPool.hooks ?? zeroAddress,
  )
  const expectedZeroForOne = isAddressEqual(
    tokenIn,
    swapParams.poolKey.currency0,
  )
  if (swapParams.zeroForOne === expectedZeroForOne) return
  throw new QuoteCalldataMismatchError({
    field: 'zeroForOne',
    expected: String(expectedZeroForOne),
    received: String(swapParams.zeroForOne),
    detail: 'swap direction does not match the quoted input asset',
  })
}

function currencyAddress(
  asset: SwapQuote['assetIn'],
  chainId: SwapQuote['chainId'],
): Address {
  return isNativeAsset(asset) ? zeroAddress : getAssetAddress(asset, chainId)
}

function assertNumber(field: string, actual: number, expected: number): void {
  if (actual === expected) return
  throw new QuoteCalldataMismatchError({
    field,
    expected: String(expected),
    received: String(actual),
  })
}

function assertAddress(
  field: string,
  actual: Address,
  expected: Address,
): void {
  if (isAddressEqual(actual, expected)) return
  throw new QuoteCalldataMismatchError({
    field,
    expected,
    received: actual,
  })
}

function assertAmount(
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
