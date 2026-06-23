import type { Address, Hex, PublicClient } from 'viem'
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
} from 'viem'

import {
  LEAF_ROUTER_ABI,
  POOL_ABI,
  POOL_FACTORY_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/actions/swap/providers/velodrome/abis.js'
import type { VelodromeRouterType } from '@/actions/swap/providers/velodrome/config.js'
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

/** Universal Router V2_SWAP_EXACT_IN command byte */
const V2_SWAP_EXACT_IN = 0x08

/** ABI param shape for the V2_SWAP_EXACT_IN input payload. Shared with tests. */
export const V2_SWAP_EXACT_IN_INPUT_PARAMS = [
  { name: 'recipient', type: 'address' },
  { name: 'amountIn', type: 'uint256' },
  { name: 'amountOutMin', type: 'uint256' },
  { name: 'route', type: 'bytes' },
  { name: 'payerIsUser', type: 'bool' },
  { name: 'isUni', type: 'bool' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Quoting
// ─────────────────────────────────────────────────────────────────────────────

export interface GetQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  routerAddress: Address
  routerType: VelodromeRouterType
  stable: boolean
  factoryAddress: Address
}

/**
 * Get a v2 AMM swap quote.
 * @param params - Quote parameters including router type
 * @returns Price quote with amounts and route
 */
export async function getQuote(params: GetQuoteParams): Promise<SwapPrice> {
  const { assetIn, assetOut, amountInRaw, chainId } = params
  const { tokenIn, tokenOut } = resolveTokens(assetIn, assetOut, chainId)
  const amountOutRaw = await fetchAmountOut(params, tokenIn, tokenOut)
  const route: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [{ address: tokenIn, fee: 0, version: 'v2' }],
  }
  return buildSwapPrice(assetIn, assetOut, amountInRaw, amountOutRaw, route)
}

/**
 * Fetch the output amount using the appropriate quoting mechanism for the router type.
 * @param params - Quote parameters
 * @param tokenIn - Resolved input token address
 * @param tokenOut - Resolved output token address
 * @returns Output amount as raw bigint
 * @throws If router type is unknown
 */
async function fetchAmountOut(
  params: GetQuoteParams,
  tokenIn: Address,
  tokenOut: Address,
): Promise<bigint> {
  const { routerType } = params

  if (routerType === 'universal') {
    return fetchAmountOutViaPool(params, tokenIn, tokenOut)
  }
  if (routerType === 'v2') {
    return fetchAmountOutViaRouter(params, V2_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
      factory: params.factoryAddress,
    })
  }
  if (routerType === 'leaf') {
    return fetchAmountOutViaRouter(params, LEAF_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
    })
  }
  throw new Error(`Unknown router type: ${routerType as string}`)
}

/** Quote via Pool.getAmountOut (Universal Router path, no router-level quoting available). */
async function fetchAmountOutViaPool(
  params: GetQuoteParams,
  tokenIn: Address,
  tokenOut: Address,
): Promise<bigint> {
  const { publicClient, factoryAddress, stable, assetIn, assetOut } = params

  const poolAddress = await publicClient.readContract({
    address: factoryAddress,
    abi: POOL_FACTORY_ABI,
    functionName: 'getPool',
    args: [tokenIn, tokenOut, stable],
  })

  if (
    !poolAddress ||
    poolAddress === '0x0000000000000000000000000000000000000000'
  ) {
    throw new MarketNotAllowedError({
      assetInSymbol: assetIn.metadata.symbol,
      assetOutSymbol: assetOut.metadata.symbol,
      chainId: params.chainId,
      reason: `No Velodrome pool found for ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} (stable=${stable})`,
    })
  }

  return (await publicClient.readContract({
    address: poolAddress as Address,
    abi: POOL_ABI,
    functionName: 'getAmountOut',
    args: [params.amountInRaw, tokenIn],
  })) as bigint
}

/** Quote via Router.getAmountsOut (v2 and leaf router path). */
async function fetchAmountOutViaRouter(
  params: GetQuoteParams,
  abi: typeof V2_ROUTER_ABI | typeof LEAF_ROUTER_ABI,
  route: { from: Address; to: Address; stable: boolean; factory?: Address },
): Promise<bigint> {
  const amounts = await params.publicClient.readContract({
    address: params.routerAddress,
    abi,
    functionName: 'getAmountsOut',
    args: [params.amountInRaw, [route]],
  })
  return (amounts as bigint[])[1]
}

// ─────────────────────────────────────────────────────────────────────────────
// Encoding
// ─────────────────────────────────────────────────────────────────────────────

export interface EncodeSwapParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  amountOutMin: bigint
  routerType: VelodromeRouterType
  stable: boolean
  factoryAddress: Address
  recipient: Address
  deadline: number
  chainId: SupportedChainId
}

/**
 * Encode swap calldata for the appropriate router type.
 * @param params - Swap encoding parameters
 * @returns Encoded calldata as hex string
 * @throws If router type is unknown
 */
export function encodeSwap(params: EncodeSwapParams): Hex {
  const { routerType } = params
  const { tokenIn, tokenOut } = resolveTokens(
    params.assetIn,
    params.assetOut,
    params.chainId,
  )

  if (routerType === 'universal') {
    return encodeUniversalV2Swap(tokenIn, tokenOut, params)
  }
  if (routerType === 'v2') {
    return encodeRouterSwap(tokenIn, tokenOut, params, V2_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
      factory: params.factoryAddress,
    })
  }
  if (routerType === 'leaf') {
    return encodeRouterSwap(tokenIn, tokenOut, params, LEAF_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
    })
  }
  throw new Error(`Unknown router type: ${routerType as string}`)
}

/**
 * Encode a V2_SWAP_EXACT_IN command for the Universal Router.
 * Route: encodePacked(tokenIn, stable, tokenOut), 41 bytes per hop.
 *
 * payerIsUser = true: the router pulls tokens from msg.sender via standard
 * transferFrom against an existing ERC20 allowance. Works for both EOAs (sequential
 * approve + execute) and smart wallets (atomic approve + execute in one UserOp).
 */
function encodeUniversalV2Swap(
  tokenIn: Address,
  tokenOut: Address,
  params: EncodeSwapParams,
): Hex {
  assertNoNativeInput(params.assetIn, 'Velodrome universal router')

  const commands = encodePacked(['uint8'], [V2_SWAP_EXACT_IN])
  const routes = encodePacked(
    ['address', 'bool', 'address'],
    [tokenIn, params.stable, tokenOut],
  )
  const recipient = assertChecksummedRecipient(params.recipient)
  const input = encodeAbiParameters(V2_SWAP_EXACT_IN_INPUT_PARAMS, [
    recipient,
    params.amountInRaw,
    params.amountOutMin,
    routes,
    true, // payerIsUser: router pulls from msg.sender via transferFrom
    false, // isUni: false for Velodrome/Aerodrome
  ])
  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [input], BigInt(params.deadline)],
  })
}

/**
 * Encode swap calldata for v2 or leaf routers.
 * Selects the correct swap function based on whether native ETH is involved.
 */
function encodeRouterSwap(
  tokenIn: Address,
  tokenOut: Address,
  params: EncodeSwapParams,
  abi: typeof V2_ROUTER_ABI | typeof LEAF_ROUTER_ABI,
  route: { from: Address; to: Address; stable: boolean; factory?: Address },
): Hex {
  const { assetIn, assetOut, amountInRaw, amountOutMin, deadline } = params
  const recipient = assertChecksummedRecipient(params.recipient)

  if (isNativeAsset(assetIn)) {
    return encodeFunctionData({
      abi,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMin, [route], recipient, BigInt(deadline)],
    })
  }

  if (isNativeAsset(assetOut)) {
    return encodeFunctionData({
      abi,
      functionName: 'swapExactTokensForETH',
      args: [amountInRaw, amountOutMin, [route], recipient, BigInt(deadline)],
    })
  }

  return encodeFunctionData({
    abi,
    functionName: 'swapExactTokensForTokens',
    args: [amountInRaw, amountOutMin, [route], recipient, BigInt(deadline)],
  })
}

/**
 * Decode the recipient from Velodrome v2, leaf, or universal-router calldata.
 * @param swapCalldata - Encoded swap calldata
 * @param routerType - Router variant used for the quote
 * @returns Recipient address baked into the calldata
 * @throws InvalidParamsError when the router type is unknown
 */
export function decodeSwapRecipient(
  swapCalldata: Hex,
  routerType: VelodromeRouterType,
): Address {
  if (routerType === 'universal') {
    return decodeUniversalV2SwapRecipient(swapCalldata)
  }
  if (routerType === 'v2' || routerType === 'leaf') {
    return decodeRouterSwapRecipient(swapCalldata, routerType)
  }
  throw new InvalidParamsError({
    param: 'routerType',
    expected: 'universal, v2, or leaf',
    received: String(routerType),
  })
}

/**
 * Decode the recipient from a Velodrome universal-router V2 swap.
 * @param swapCalldata - Encoded Universal Router execute calldata
 * @returns Recipient address from the V2_SWAP_EXACT_IN input payload
 */
export function decodeUniversalV2SwapRecipient(swapCalldata: Hex): Address {
  const { args } = decodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    data: swapCalldata,
  })
  const commands = args[0]
  const inputs = args[1]
  assertSingleUniversalCommand(
    commands,
    V2_SWAP_EXACT_IN,
    'Velodrome universal V2_SWAP_EXACT_IN calldata',
  )
  assertSingleUniversalInput(inputs)
  const decoded = decodeAbiParameters(V2_SWAP_EXACT_IN_INPUT_PARAMS, inputs[0])
  const recipient = decoded[0]
  assertUniversalPayerIsUser(decoded[4])
  return recipient
}

/**
 * Decode the recipient from Velodrome v2 or leaf router calldata.
 * @param swapCalldata - Encoded v2 or leaf router calldata
 * @param routerType - Legacy router variant used for the quote
 * @returns Recipient address from the router swap call
 */
export function decodeRouterSwapRecipient(
  swapCalldata: Hex,
  routerType: Extract<VelodromeRouterType, 'v2' | 'leaf'>,
): Address {
  const abi = routerType === 'leaf' ? LEAF_ROUTER_ABI : V2_ROUTER_ABI
  const { functionName, args } = decodeFunctionData({ abi, data: swapCalldata })

  if (functionName === 'swapExactETHForTokens') {
    const [, , recipient] = args
    return recipient
  }

  if (
    functionName === 'swapExactTokensForETH' ||
    functionName === 'swapExactTokensForTokens'
  ) {
    const [, , , recipient] = args
    return recipient
  }

  throw new InvalidParamsError({
    param: 'swapCalldata',
    expected: 'Velodrome v2 or leaf swap calldata',
    received: functionName,
  })
}

function assertNoNativeInput(assetIn: Asset, context: string): void {
  if (isNativeAsset(assetIn)) {
    throw new NativeAssetNotSupportedError({
      symbol: assetIn.metadata.symbol,
      context,
    })
  }
}
