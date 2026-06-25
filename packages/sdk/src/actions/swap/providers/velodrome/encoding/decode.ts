import type { Hex } from 'viem'
import { decodeFunctionData } from 'viem'

import { assertSwapDeadlineField } from '@/actions/swap/core/calldataValidation.js'
import {
  LEAF_ROUTER_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/actions/swap/providers/velodrome/abis.js'
import {
  assertRouterSwapFields,
  assertUniversalSwapFields,
} from '@/actions/swap/providers/velodrome/encoding/decodeQuoteFields.js'
import { UNIVERSAL_ROUTER_MSG_SENDER } from '@/actions/swap/providers/velodrome/encoding/helpers.js'
import type { ResolvedPoolConfig } from '@/actions/swap/providers/velodrome/types.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type { SwapQuote } from '@/types/swap/index.js'

/**
 * Universal Router command bytes the encoder emits for v2 and CL swaps.
 * Both carry the msg.sender recipient sentinel in the first input field.
 */
const UNIVERSAL_SWAP_COMMANDS = new Set(['0x08', '0x00'])

/**
 * Decode Velodrome/Aerodrome calldata and assert it routes to this wallet.
 * Dispatch is selector-based so actual bytes determine the encoding family.
 * @throws QuoteCalldataMismatchError when bytes route elsewhere or are unknown.
 */
export function assertVelodromeQuoteBound(
  quote: SwapQuote,
  expectedPool: ResolvedPoolConfig,
  expectedFactory: `0x${string}`,
): void {
  const data = quote.execution.swapCalldata

  const universal = tryDecodeUniversal(data)
  if (universal) {
    assertUniversalSwapMatchesQuote(quote, universal, expectedPool)
    return
  }

  if (isRouterSwapCall(quote, data, expectedPool, expectedFactory)) {
    return
  }

  throw new QuoteCalldataMismatchError({
    field: 'swapCalldata',
    detail: 'unrecognized Velodrome/Aerodrome swap calldata',
  })
}

/** Decode `execute(bytes commands, bytes[] inputs, uint256 deadline)`, or `undefined` when the bytes are a router call instead. */
function tryDecodeUniversal(
  data: Hex,
): { commands: Hex; inputs: readonly Hex[]; deadline: bigint } | undefined {
  try {
    const decoded = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data })
    if (decoded.functionName !== 'execute') return undefined
    return {
      commands: decoded.args[0],
      inputs: decoded.args[1],
      deadline: decoded.args[2],
    }
  } catch {
    return undefined
  }
}

function assertUniversalSwapMatchesQuote(
  quote: SwapQuote,
  decoded: {
    commands: Hex
    inputs: readonly Hex[]
    deadline: bigint
  },
  expectedPool: ResolvedPoolConfig,
): void {
  assertUniversalShape(decoded)
  assertSwapDeadlineField(quote, decoded.deadline)
  assertUniversalSwapFields(
    quote,
    decoded.commands,
    decoded.inputs[0],
    UNIVERSAL_ROUTER_MSG_SENDER,
    expectedPool,
  )
}

function assertUniversalShape(decoded: {
  commands: Hex
  inputs: readonly Hex[]
}): void {
  if (!UNIVERSAL_SWAP_COMMANDS.has(decoded.commands.toLowerCase())) {
    throw new QuoteCalldataMismatchError({
      field: 'commands',
      expected: [...UNIVERSAL_SWAP_COMMANDS].join(' or '),
      received: decoded.commands,
    })
  }
  if (decoded.inputs.length !== 1) {
    throw new QuoteCalldataMismatchError({
      field: 'inputs',
      expected: '1',
      received: String(decoded.inputs.length),
    })
  }
}

function isRouterSwapCall(
  quote: SwapQuote,
  data: Hex,
  expectedPool: ResolvedPoolConfig,
  expectedFactory: `0x${string}`,
): boolean {
  for (const abi of [V2_ROUTER_ABI, LEAF_ROUTER_ABI] as const) {
    try {
      const decoded = decodeFunctionData({ abi, data })
      if (decoded.functionName === 'swapExactETHForTokens') {
        assertRouterSwapFields(
          quote,
          {
            kind: 'ethForTokens',
            amountOutMin: decoded.args[0],
            routes: decoded.args[1],
            recipient: decoded.args[2],
            deadline: decoded.args[3],
          },
          expectedPool,
          expectedFactory,
        )
        return true
      }
      if (
        decoded.functionName === 'swapExactTokensForTokens' ||
        decoded.functionName === 'swapExactTokensForETH'
      ) {
        assertRouterSwapFields(
          quote,
          {
            kind:
              decoded.functionName === 'swapExactTokensForETH'
                ? 'tokensForEth'
                : 'tokensForTokens',
            amountIn: decoded.args[0],
            amountOutMin: decoded.args[1],
            routes: decoded.args[2],
            recipient: decoded.args[3],
            deadline: decoded.args[4],
          },
          expectedPool,
          expectedFactory,
        )
        return true
      }
      // Decoded as a non-swap router function (e.g. getAmountsOut): not a swap.
    } catch {
      // try the next router ABI
    }
  }
  return false
}
