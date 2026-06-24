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
 * Universal Router command bytes the encoder emits: `V2_SWAP_EXACT_IN` (0x08)
 * for v2 AMM pools and `V3_SWAP_EXACT_IN` (0x00) for CL/Slipstream pools. Both
 * carry the recipient as the first input field and the encoder sets it to the
 * `msg.sender` sentinel.
 */
const UNIVERSAL_SWAP_COMMANDS = new Set(['0x08', '0x00'])

/**
 * Decode a Velodrome/Aerodrome swap quote's calldata and assert it routes
 * output to this wallet.
 * @description Two encoding families exist. The Universal Router path
 * (`universal` chains and CL pools) bakes the `msg.sender` sentinel as the
 * recipient, so the executing wallet is structurally the recipient: we assert
 * the single expected swap command and that the encoded recipient is the
 * sentinel. The v2/leaf router path encodes a literal `to` address, so we
 * decode it and assert it equals `quote.recipient` (which the namespace has
 * already bound to the wallet). Dispatch is selector-based, not config-based,
 * so a CL swap that compiles to Universal Router calldata on a `v2` chain is
 * still classified by its actual bytes.
 * @param quote - Wallet-bound swap quote whose `execution.swapCalldata` is decoded.
 * @throws QuoteCalldataMismatchError when the recipient encoded in the bytes is
 * not the executing wallet, or the calldata is not a recognized Velodrome swap.
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
