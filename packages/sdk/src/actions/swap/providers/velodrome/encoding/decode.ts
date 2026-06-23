import type { Address, Hex } from 'viem'
import {
  decodeAbiParameters,
  decodeFunctionData,
  isAddressEqual,
  slice,
} from 'viem'

import {
  LEAF_ROUTER_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/actions/swap/providers/velodrome/abis.js'
import { UNIVERSAL_ROUTER_MSG_SENDER } from '@/actions/swap/providers/velodrome/encoding/helpers.js'
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
export function assertVelodromeQuoteBound(quote: SwapQuote): void {
  const data = quote.execution.swapCalldata

  const universal = tryDecodeUniversal(data)
  if (universal) {
    assertUniversalRecipientIsSentinel(universal)
    return
  }

  const literalRecipient = tryDecodeRouterRecipient(data)
  if (literalRecipient !== undefined) {
    if (!isAddressEqual(literalRecipient, quote.recipient)) {
      throw new QuoteCalldataMismatchError({
        field: 'recipient',
        expected: quote.recipient,
        received: literalRecipient,
      })
    }
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
): { commands: Hex; inputs: readonly Hex[] } | undefined {
  try {
    const decoded = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data })
    if (decoded.functionName !== 'execute') return undefined
    return { commands: decoded.args[0], inputs: decoded.args[1] }
  } catch {
    return undefined
  }
}

function assertUniversalRecipientIsSentinel(decoded: {
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
  const recipient = decodeUniversalRecipient(decoded.inputs[0])
  if (!isAddressEqual(recipient, UNIVERSAL_ROUTER_MSG_SENDER)) {
    throw new QuoteCalldataMismatchError({
      field: 'recipient',
      expected: `${UNIVERSAL_ROUTER_MSG_SENDER} (msg.sender sentinel)`,
      received: recipient,
    })
  }
}

function decodeUniversalRecipient(input: Hex): Address {
  try {
    // The recipient is the first field of both V2_SWAP and V3_SWAP input payloads.
    const [recipient] = decodeAbiParameters(
      [{ type: 'address' }],
      slice(input, 0, 32),
    )
    return recipient
  } catch {
    throw new QuoteCalldataMismatchError({
      field: 'recipient',
      detail: 'unable to decode universal-router recipient',
    })
  }
}

/** Decode a v2/leaf router swap and return its literal `to` recipient, or `undefined` if the bytes are not such a call. */
function tryDecodeRouterRecipient(data: Hex): Address | undefined {
  for (const abi of [V2_ROUTER_ABI, LEAF_ROUTER_ABI] as const) {
    try {
      const decoded = decodeFunctionData({ abi, data })
      // swapExactETHForTokens: (amountOutMin, routes, to, deadline) -> to at index 2.
      if (decoded.functionName === 'swapExactETHForTokens') {
        return decoded.args[2]
      }
      // swap{ExactTokensForTokens,ExactTokensForETH}: (amountIn, amountOutMin, routes, to, deadline) -> to at index 3.
      if (
        decoded.functionName === 'swapExactTokensForTokens' ||
        decoded.functionName === 'swapExactTokensForETH'
      ) {
        return decoded.args[3]
      }
      // Decoded as a non-swap router function (e.g. getAmountsOut): not a swap.
    } catch {
      // try the next router ABI
    }
  }
  return undefined
}
