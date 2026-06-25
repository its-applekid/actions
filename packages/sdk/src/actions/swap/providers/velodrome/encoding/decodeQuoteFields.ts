import type { Address, Hex } from 'viem'
import { decodeAbiParameters, getAddress, slice } from 'viem'

import {
  assertSwapAddressField,
  assertSwapAmountField,
  assertSwapDeadlineField,
} from '@/actions/swap/core/calldataValidation.js'
import { resolveTokens } from '@/actions/swap/providers/velodrome/encoding/helpers.js'
import { V3_SWAP_EXACT_IN_INPUT_PARAMS } from '@/actions/swap/providers/velodrome/encoding/routers/cl.js'
import { V2_SWAP_EXACT_IN_INPUT_PARAMS } from '@/actions/swap/providers/velodrome/encoding/routers/v2.js'
import type { ResolvedPoolConfig } from '@/actions/swap/providers/velodrome/types.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'
import { isNativeAsset } from '@/utils/assets.js'

const V2_SWAP_EXACT_IN = '0x08'
const V3_SWAP_EXACT_IN = '0x00'

export interface RouterSwapFields {
  kind: 'ethForTokens' | 'tokensForEth' | 'tokensForTokens'
  recipient: Address
  amountIn?: bigint
  amountOutMin: bigint
  routes: ReadonlyArray<{
    from: Address
    to: Address
    stable: boolean
    factory?: Address
  }>
  deadline: bigint
}

export function assertUniversalSwapFields(
  quote: SwapQuote,
  command: Hex,
  input: Hex,
  expectedRecipient: Address,
  expectedPool: ResolvedPoolConfig,
): void {
  const normalizedCommand = command.toLowerCase()
  if (normalizedCommand === V2_SWAP_EXACT_IN) {
    assertV2Pool(expectedPool)
    const [recipient, amountIn, amountOutMin, route, payerIsUser, isUni] =
      decodeUniversalV2(input)
    assertSwapAddressField('recipient', recipient, expectedRecipient)
    assertSwapAmountField('amountIn', amountIn, quote.amountInRaw)
    assertSwapAmountField('amountOutMin', amountOutMin, quote.amountOutMinRaw)
    assertBoolean('payerIsUser', payerIsUser, true)
    assertBoolean('isUni', isUni, false)
    assertPackedRoute(quote, route, 21)
    assertPackedStable(route, expectedPool.stable)
    return
  }
  assertClPool(expectedPool)
  const [recipient, amountIn, amountOutMin, path, payerIsUser] =
    decodeUniversalV3(input)
  assertSwapAddressField('recipient', recipient, expectedRecipient)
  assertSwapAmountField('amountIn', amountIn, quote.amountInRaw)
  assertSwapAmountField('amountOutMin', amountOutMin, quote.amountOutMinRaw)
  assertBoolean('payerIsUser', payerIsUser, true)
  assertPackedRoute(quote, path, 23)
  assertPackedTickSpacing(path, expectedPool.tickSpacing)
}

export function assertRouterSwapFields(
  quote: SwapQuote,
  fields: RouterSwapFields,
  expectedPool: ResolvedPoolConfig,
  expectedFactory: Address,
): void {
  assertRouterKind(quote, fields.kind)
  assertV2Pool(expectedPool)
  assertSwapAddressField('recipient', fields.recipient, quote.recipient)
  assertSwapDeadlineField(quote, fields.deadline)
  if (fields.amountIn !== undefined) {
    assertSwapAmountField('amountIn', fields.amountIn, quote.amountInRaw)
  } else {
    assertSwapAmountField('amountIn', quote.execution.value, quote.amountInRaw)
  }
  assertSwapAmountField(
    'amountOutMin',
    fields.amountOutMin,
    quote.amountOutMinRaw,
  )
  if (fields.routes.length !== 1) {
    throw new QuoteCalldataMismatchError({
      field: 'routes',
      expected: '1',
      received: String(fields.routes.length),
    })
  }
  const { tokenIn, tokenOut } = resolveTokens(
    quote.assetIn,
    quote.assetOut,
    quote.chainId,
  )
  assertSwapAddressField('route.from', fields.routes[0].from, tokenIn)
  assertSwapAddressField('route.to', fields.routes[0].to, tokenOut)
  assertBoolean('route.stable', fields.routes[0].stable, expectedPool.stable)
  if (fields.routes[0].factory) {
    assertSwapAddressField(
      'route.factory',
      fields.routes[0].factory,
      expectedFactory,
    )
  }
}

function decodeUniversalV2(input: Hex) {
  try {
    return decodeAbiParameters(V2_SWAP_EXACT_IN_INPUT_PARAMS, input)
  } catch {
    throw new QuoteCalldataMismatchError({
      field: 'inputs',
      detail: 'unable to decode V2 universal-router swap input',
    })
  }
}

function decodeUniversalV3(input: Hex) {
  try {
    return decodeAbiParameters(V3_SWAP_EXACT_IN_INPUT_PARAMS, input)
  } catch {
    throw new QuoteCalldataMismatchError({
      field: 'inputs',
      detail: 'unable to decode V3 universal-router swap input',
    })
  }
}

function assertPackedRoute(
  quote: SwapQuote,
  route: Hex,
  tokenOutOffset: number,
): void {
  const expectedLength = tokenOutOffset + 20
  const actualLength = (route.length - 2) / 2
  if (actualLength !== expectedLength) {
    throw new QuoteCalldataMismatchError({
      field: 'route',
      expected: `${expectedLength} bytes`,
      received: `${actualLength} bytes`,
    })
  }
  const { tokenIn, tokenOut } = resolveTokens(
    quote.assetIn,
    quote.assetOut,
    quote.chainId,
  )
  assertSwapAddressField('route tokenIn', packedAddress(route, 0), tokenIn)
  assertSwapAddressField(
    'route tokenOut',
    packedAddress(route, tokenOutOffset),
    tokenOut,
  )
}

function assertPackedStable(route: Hex, expected: boolean): void {
  assertBoolean(
    'route.stable',
    slice(route, 20, 21).toLowerCase() === '0x01',
    expected,
  )
}

function assertPackedTickSpacing(route: Hex, expected: number): void {
  const actual = Number(BigInt(slice(route, 20, 23)))
  assertSwapAmountField('route.tickSpacing', BigInt(actual), BigInt(expected))
}

function packedAddress(data: Hex, offset: number): Address {
  try {
    return getAddress(slice(data, offset, offset + 20))
  } catch {
    throw new QuoteCalldataMismatchError({
      field: 'route',
      detail: 'unable to decode packed route address',
    })
  }
}

function assertRouterKind(
  quote: SwapQuote,
  kind: RouterSwapFields['kind'],
): void {
  const nativeIn = isNativeAsset(quote.assetIn)
  const nativeOut = isNativeAsset(quote.assetOut)
  if (kind === 'ethForTokens') {
    assertBoolean('native input', nativeIn, true)
    assertBoolean('native output', nativeOut, false)
    return
  }
  if (kind === 'tokensForEth') {
    assertBoolean('native input', nativeIn, false)
    assertBoolean('native output', nativeOut, true)
    return
  }
  assertBoolean('native input', nativeIn, false)
  assertBoolean('native output', nativeOut, false)
}

function assertV2Pool(pool: ResolvedPoolConfig): asserts pool is {
  type: 'v2'
  stable: boolean
} {
  if (pool.type === 'v2') return
  throw new QuoteCalldataMismatchError({
    field: 'pool type',
    expected: 'v2',
    received: pool.type,
  })
}

function assertClPool(pool: ResolvedPoolConfig): asserts pool is {
  type: 'cl'
  tickSpacing: number
} {
  if (pool.type === 'cl') return
  throw new QuoteCalldataMismatchError({
    field: 'pool type',
    expected: 'cl',
    received: pool.type,
  })
}

function assertBoolean(
  field: string,
  actual: boolean,
  expected: boolean,
): void {
  if (actual === expected) return
  throw new QuoteCalldataMismatchError({
    field,
    expected: String(expected),
    received: String(actual),
  })
}
