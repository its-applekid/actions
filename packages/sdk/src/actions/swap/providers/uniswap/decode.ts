import type { Address, Hex } from 'viem'
import {
  decodeAbiParameters,
  decodeFunctionData,
  isAddressEqual,
  zeroAddress,
} from 'viem'

import {
  EXACT_INPUT_SINGLE_PARAMS,
  EXACT_OUTPUT_SINGLE_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

/**
 * Universal Router command for a V4 swap (`V4_SWAP`). The encoder emits exactly
 * this single command; any other command byte (e.g. `SWEEP`/`TRANSFER`) could
 * route output to a third party, so we reject anything but this.
 */
const V4_SWAP_COMMAND = '0x10'

/**
 * Canonical V4 action sequences the encoder produces:
 * `[SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]` (0x06,0x0c,0x0f) and the
 * exact-output variant (0x08,0x0c,0x0f). `TAKE_ALL` settles the output to
 * `msg.sender`; rejecting any other sequence blocks a `TAKE` leg with an
 * explicit attacker recipient.
 */
const V4_EXACT_IN_ACTIONS = '0x060c0f'
const V4_EXACT_OUT_ACTIONS = '0x080c0f'

/**
 * Decode a Uniswap V4 swap quote's calldata and assert it is the canonical
 * Universal Router swap the SDK builds, swapping the quoted pair to
 * `msg.sender`.
 * @description Uniswap V4 carries no recipient argument: `TAKE_ALL` settles the
 * output delta to the caller, so the executing wallet is structurally the
 * recipient. The risk is therefore not a wrong recipient field but a
 * non-canonical command/action set (a `SWEEP`/`TRANSFER` command or a `TAKE`
 * with an explicit recipient) that diverts funds. We assert the single
 * `V4_SWAP` command, the exact action sequence, and that the pool currencies
 * are the quoted assets, then trust the msg.sender settlement.
 * @param quote - Wallet-bound swap quote whose `execution.swapCalldata` is decoded.
 * @throws QuoteCalldataMismatchError when the bytes are not a canonical V4 swap
 * of the quoted pair.
 */
export function assertUniswapV4QuoteBound(quote: SwapQuote): void {
  const decoded = tryDecodeExecute(quote.execution.swapCalldata)
  if (!decoded) {
    throw new QuoteCalldataMismatchError({
      field: 'swapCalldata',
      detail: 'not a Uniswap Universal Router execute() call',
    })
  }
  const [commands, inputs] = decoded

  if (commands.toLowerCase() !== V4_SWAP_COMMAND) {
    throw new QuoteCalldataMismatchError({
      field: 'commands',
      expected: V4_SWAP_COMMAND,
      received: commands,
    })
  }
  if (inputs.length !== 1) {
    throw new QuoteCalldataMismatchError({
      field: 'inputs',
      expected: '1',
      received: String(inputs.length),
    })
  }

  const { actions, params } = decodeV4SwapInput(inputs[0])
  const normalizedActions = actions.toLowerCase()
  const isExactIn = normalizedActions === V4_EXACT_IN_ACTIONS
  const isExactOut = normalizedActions === V4_EXACT_OUT_ACTIONS
  if (!isExactIn && !isExactOut) {
    throw new QuoteCalldataMismatchError({
      field: 'actions',
      expected: `${V4_EXACT_IN_ACTIONS} or ${V4_EXACT_OUT_ACTIONS}`,
      received: actions,
    })
  }

  if (params.length !== 3) {
    throw new QuoteCalldataMismatchError({
      field: 'action params',
      expected: '3',
      received: String(params.length),
    })
  }

  const swapParams = decodeSwapParams(params[0], isExactIn)
  assertPoolMatchesQuote(quote, swapParams.poolKey, swapParams.zeroForOne)
}

/** Decode `execute(bytes commands, bytes[] inputs, uint256 deadline)`, or `undefined` if the bytes are not that call. */
function tryDecodeExecute(
  data: SwapQuote['execution']['swapCalldata'],
): readonly [Hex, readonly Hex[]] | undefined {
  try {
    const decoded = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data })
    if (decoded.functionName !== 'execute') return undefined
    return [decoded.args[0], decoded.args[1]]
  } catch {
    return undefined
  }
}

function decodeV4SwapInput(input: Hex): {
  actions: Hex
  params: readonly Hex[]
} {
  try {
    const [actions, params] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      input,
    )
    return { actions, params }
  } catch {
    throw new QuoteCalldataMismatchError({
      field: 'inputs',
      detail: 'unable to decode V4 swap input',
    })
  }
}

function decodeSwapParams(
  data: Hex,
  isExactIn: boolean,
): {
  poolKey: { currency0: Address; currency1: Address }
  zeroForOne: boolean
} {
  try {
    const [swapParams] = decodeAbiParameters(
      isExactIn ? EXACT_INPUT_SINGLE_PARAMS : EXACT_OUTPUT_SINGLE_PARAMS,
      data,
    )
    return swapParams
  } catch {
    throw new QuoteCalldataMismatchError({
      field: 'swap params',
      detail: 'unable to decode V4 swap params',
    })
  }
}

/** Currency address the quoted pair encodes (native = address(0)). */
function currencyAddress(
  asset: SwapQuote['assetIn'],
  chainId: SwapQuote['chainId'],
): Address {
  return isNativeAsset(asset) ? zeroAddress : getAssetAddress(asset, chainId)
}

/**
 * Assert the decoded pool is the quoted pair *and* the swap direction matches
 * the quoted input. The poolKey is direction-agnostic (currencies are sorted),
 * so currency-set matching alone would pass a quote that reversed the swap and
 * sold the wrong token; the `zeroForOne` check pins the input token to
 * `quote.assetIn`.
 */
function assertPoolMatchesQuote(
  quote: SwapQuote,
  poolKey: { currency0: Address; currency1: Address },
  zeroForOne: boolean,
): void {
  const tokenIn = currencyAddress(quote.assetIn, quote.chainId)
  const tokenOut = currencyAddress(quote.assetOut, quote.chainId)
  const [expected0, expected1] =
    tokenIn.toLowerCase() < tokenOut.toLowerCase()
      ? [tokenIn, tokenOut]
      : [tokenOut, tokenIn]
  if (
    !isAddressEqual(poolKey.currency0, expected0) ||
    !isAddressEqual(poolKey.currency1, expected1)
  ) {
    throw new QuoteCalldataMismatchError({
      field: 'poolKey currencies',
      expected: `${expected0}, ${expected1}`,
      received: `${poolKey.currency0}, ${poolKey.currency1}`,
    })
  }
  const expectedZeroForOne = isAddressEqual(tokenIn, poolKey.currency0)
  if (zeroForOne !== expectedZeroForOne) {
    throw new QuoteCalldataMismatchError({
      field: 'zeroForOne',
      expected: String(expectedZeroForOne),
      received: String(zeroForOne),
      detail: 'swap direction does not match the quoted input asset',
    })
  }
}
