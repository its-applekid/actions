import type { Address, Hex, PublicClient } from 'viem'
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  isAddress,
} from 'viem'

import { decodeQuoteCalldata } from '@/actions/swap/core/quoteIntegrity.js'
import {
  CL_POOL_FACTORY_ABI,
  CL_QUOTER_ABI,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/velodrome/abis.js'
import {
  assertSingleUniversalCommand,
  assertSingleUniversalInput,
  assertUniversalPayerIsUser,
  buildSwapPrice,
  resolveTokens,
} from '@/actions/swap/providers/velodrome/encoding/helpers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  InvalidParamsError,
  MarketNotAllowedError,
  NativeAssetNotSupportedError,
} from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { isNativeAsset } from '@/utils/assets.js'
import { assertChecksummedRecipient } from '@/utils/validation.js'

// ─────────────────────────────────────────────────────────────────────────────
// Quoting
// ─────────────────────────────────────────────────────────────────────────────

export interface GetCLQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  clFactoryAddress: Address
  clQuoterAddress: Address
  tickSpacing: number
}

/**
 * Get a swap quote from a CL/Slipstream pool via QuoterV2.
 * Verifies the pool exists via the CL factory, then quotes via QuoterV2.
 * @param params - CL quote parameters
 * @returns Price quote with amounts and route
 * @throws If no CL pool exists for the given pair and tickSpacing
 */
export async function getCLQuote(params: GetCLQuoteParams): Promise<SwapPrice> {
  const {
    assetIn,
    assetOut,
    amountInRaw,
    publicClient,
    clFactoryAddress,
    clQuoterAddress,
    tickSpacing,
    chainId,
  } = params
  const { tokenIn, tokenOut } = resolveTokens(assetIn, assetOut, chainId)

  // Verify the CL pool exists
  const poolAddress = await publicClient.readContract({
    address: clFactoryAddress,
    abi: CL_POOL_FACTORY_ABI,
    functionName: 'getPool',
    args: [tokenIn, tokenOut, tickSpacing],
  })

  if (
    !poolAddress ||
    poolAddress === '0x0000000000000000000000000000000000000000'
  ) {
    throw new MarketNotAllowedError({
      assetInSymbol: assetIn.metadata.symbol,
      assetOutSymbol: assetOut.metadata.symbol,
      chainId,
      reason: `No CL pool found for ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} (tickSpacing=${tickSpacing})`,
    })
  }

  // Quote via QuoterV2.quoteExactInputSingle
  // sqrtPriceLimitX96 = 0 means no price limit
  const quoteResult = (await publicClient.readContract({
    address: clQuoterAddress,
    abi: CL_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn,
        tokenOut,
        amountIn: amountInRaw,
        tickSpacing,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })) as readonly [bigint, bigint, number, bigint]

  const route: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [{ address: poolAddress as Address, fee: 0, version: 'v3' }],
  }
  return buildSwapPrice(assetIn, assetOut, amountInRaw, quoteResult[0], route)
}

// ─────────────────────────────────────────────────────────────────────────────
// Encoding
// ─────────────────────────────────────────────────────────────────────────────

export interface EncodeCLSwapParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  amountOutMin: bigint
  tickSpacing: number
  recipient: Address
  deadline: number
  chainId: SupportedChainId
}

export interface VelodromeCLSwapSummary {
  recipient: Address
  tokenIn: Address
  tokenOut: Address
  tickSpacing: number
}

/** Universal Router V3_SWAP_EXACT_IN command byte */
const V3_SWAP_EXACT_IN = 0x00

/** ABI param shape for the V3_SWAP_EXACT_IN input payload. Shared with tests. */
export const V3_SWAP_EXACT_IN_INPUT_PARAMS = [
  { name: 'recipient', type: 'address' },
  { name: 'amountIn', type: 'uint256' },
  { name: 'amountOutMin', type: 'uint256' },
  { name: 'path', type: 'bytes' },
  { name: 'payerIsUser', type: 'bool' },
] as const

/**
 * Encode a V3_SWAP_EXACT_IN command for a CL/Slipstream pool on the Universal Router.
 * Path: encodePacked([tokenIn (20), tickSpacing as int24 (3), tokenOut (20)]), 43 bytes.
 *
 * payerIsUser = true: the router pulls tokens from msg.sender via standard
 * transferFrom against an existing ERC20 allowance. Works for both EOAs (sequential
 * approve + execute) and smart wallets (atomic approve + execute in one UserOp).
 * @param params - CL swap encoding parameters
 * @returns Encoded calldata as hex string
 */
export function encodeCLSwap(params: EncodeCLSwapParams): Hex {
  const { amountInRaw, amountOutMin, tickSpacing, deadline, chainId } = params
  if (isNativeAsset(params.assetIn)) {
    throw new NativeAssetNotSupportedError({
      symbol: params.assetIn.metadata.symbol,
      context: 'Velodrome CL router',
    })
  }
  if (isNativeAsset(params.assetOut)) {
    throw new NativeAssetNotSupportedError({
      symbol: params.assetOut.metadata.symbol,
      context: 'Velodrome CL router',
      operation: 'output',
    })
  }
  const { tokenIn, tokenOut } = resolveTokens(
    params.assetIn,
    params.assetOut,
    chainId,
  )
  const recipient = assertChecksummedRecipient(params.recipient)

  const commands = encodePacked(['uint8'], [V3_SWAP_EXACT_IN])

  // CL path: [tokenIn (20)] [tickSpacing as int24 (3)] [tokenOut (20)], 43 bytes
  const path = encodePacked(
    ['address', 'int24', 'address'],
    [tokenIn, tickSpacing, tokenOut],
  )

  const input = encodeAbiParameters(V3_SWAP_EXACT_IN_INPUT_PARAMS, [
    recipient,
    amountInRaw,
    amountOutMin,
    path,
    true, // payerIsUser: router pulls from msg.sender via transferFrom
  ])

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [input], BigInt(deadline)],
  })
}

/**
 * @description Decode the recipient from Velodrome CL universal-router calldata.
 * @param swapCalldata - Encoded Universal Router execute calldata
 * @returns Recipient address from the V3_SWAP_EXACT_IN input payload
 * @throws InvalidParamsError when calldata is not a single V3_SWAP_EXACT_IN command.
 */
export function decodeCLSwapRecipient(swapCalldata: Hex): Address {
  return decodeCLSwapSummary(swapCalldata).recipient
}

export function decodeCLSwapSummary(swapCalldata: Hex): VelodromeCLSwapSummary {
  return decodeQuoteCalldata({
    expected: 'single Velodrome CL V3_SWAP_EXACT_IN calldata',
    decode: () => {
      const { args } = decodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        data: swapCalldata,
      })
      const [commands, inputs] = args
      assertSingleUniversalCommand(
        commands,
        V3_SWAP_EXACT_IN,
        'Velodrome CL V3_SWAP_EXACT_IN calldata',
      )
      assertSingleUniversalInput(inputs)
      const decoded = decodeAbiParameters(
        V3_SWAP_EXACT_IN_INPUT_PARAMS,
        inputs[0],
      )
      const [recipient, , , path, payerIsUser] = decoded
      assertUniversalPayerIsUser(payerIsUser)
      return { recipient, ...decodeCLPath(path) }
    },
  })
}

function decodeCLPath(path: Hex): {
  tokenIn: Address
  tokenOut: Address
  tickSpacing: number
} {
  const raw = path.slice(2)
  if (raw.length !== 86) {
    throw new InvalidParamsError({
      param: 'swapCalldata',
      expected: 'Velodrome CL path bytes with one 43-byte hop',
      received: `${raw.length / 2} bytes`,
    })
  }
  return {
    tokenIn: getPathAddress(raw, 0),
    tickSpacing: parseInt24(raw.slice(40, 46)),
    tokenOut: getPathAddress(raw, 46),
  }
}

function getPathAddress(raw: string, offset: number): Address {
  const address = `0x${raw.slice(offset, offset + 40)}`
  if (!isAddress(address)) {
    throw new InvalidParamsError({
      param: 'swapCalldata',
      expected: 'Velodrome CL path address',
      received: address,
    })
  }
  return getAddress(address)
}

function parseInt24(hex: string): number {
  const value = Number.parseInt(hex, 16)
  return value >= 0x800000 ? value - 0x1000000 : value
}
