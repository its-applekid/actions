import type { Address, Hex, PublicClient } from 'viem'

import type {
  VelodromeChainConfig,
  VelodromeRouterType,
} from '@/actions/swap/providers/velodrome/config.js'
import type { ResolvedPoolConfig } from '@/actions/swap/providers/velodrome/types.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  ChainNotSupportedError,
  InvalidParamsError,
} from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice } from '@/types/swap/index.js'

import {
  decodeCLSwapRecipient,
  decodeCLSwapSummary,
  encodeCLSwap,
  getCLQuote,
  type VelodromeCLSwapSummary,
} from './routers/cl.js'
import {
  decodeSwapRecipient,
  decodeSwapSummary,
  encodeSwap,
  getQuote,
  type VelodromeV2SwapSummary,
} from './routers/v2.js'

/** Internal result from pool-type-specific quoting */
export interface PoolQuoteResult {
  internalQuote: SwapPrice
  providerContext: Record<string, unknown>
}

export type VelodromePoolSwapSummary =
  | VelodromeCLSwapSummary
  | VelodromeV2SwapSummary

/**
 * Fetch a price quote by routing to the correct pool type (v2 AMM or CL/Slipstream).
 * @returns Internal quote and provider context for the SwapQuote
 * @throws If CL pool requested on a chain without CL factory/quoter
 */
export async function fetchPoolQuote(
  poolConfig: ResolvedPoolConfig,
  params: {
    assetIn: Asset
    assetOut: Asset
    amountInRaw: bigint
    chainId: SupportedChainId
    publicClient: PublicClient
    chain: VelodromeChainConfig
  },
): Promise<PoolQuoteResult> {
  const { assetIn, assetOut, amountInRaw, chainId, publicClient, chain } =
    params

  if (poolConfig.type === 'cl') {
    if (!chain.contracts.clPoolFactory || !chain.contracts.clQuoterV2) {
      throw new ChainNotSupportedError({ chainId })
    }
    const internalQuote = await getCLQuote({
      assetIn,
      assetOut,
      amountInRaw,
      chainId,
      publicClient,
      clFactoryAddress: chain.contracts.clPoolFactory,
      clQuoterAddress: chain.contracts.clQuoterV2,
      tickSpacing: poolConfig.tickSpacing,
    })
    return {
      internalQuote,
      providerContext: {
        tickSpacing: poolConfig.tickSpacing,
        clFactoryAddress: chain.contracts.clPoolFactory,
        poolAddress: internalQuote.route.pools[0]?.address,
      },
    }
  }

  const internalQuote = await getQuote({
    assetIn,
    assetOut,
    amountInRaw,
    chainId,
    publicClient,
    routerAddress: chain.contracts.router,
    routerType: chain.metadata.routerType,
    stable: poolConfig.stable,
    factoryAddress: chain.contracts.poolFactory,
  })
  return {
    internalQuote,
    providerContext: {
      stable: poolConfig.stable,
      factoryAddress: chain.contracts.poolFactory,
      routerType: chain.metadata.routerType,
    },
  }
}

/**
 * Encode swap calldata by routing to the correct pool type (v2 AMM or CL/Slipstream).
 * @returns Encoded calldata as hex string
 */
export function encodePoolSwap(
  poolConfig: ResolvedPoolConfig,
  params: {
    assetIn: Asset
    assetOut: Asset
    amountInRaw: bigint
    amountOutMinRaw: bigint
    recipient: Address
    deadline: number
    chainId: SupportedChainId
    chain: VelodromeChainConfig
  },
): Hex {
  if (poolConfig.type === 'cl') {
    return encodeCLSwap({
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountInRaw: params.amountInRaw,
      amountOutMin: params.amountOutMinRaw,
      tickSpacing: poolConfig.tickSpacing,
      recipient: params.recipient,
      deadline: params.deadline,
      chainId: params.chainId,
    })
  }

  return encodeSwap({
    assetIn: params.assetIn,
    assetOut: params.assetOut,
    amountInRaw: params.amountInRaw,
    amountOutMin: params.amountOutMinRaw,
    routerType: params.chain.metadata.routerType,
    stable: poolConfig.stable,
    factoryAddress: params.chain.contracts.poolFactory,
    recipient: params.recipient,
    deadline: params.deadline,
    chainId: params.chainId,
  })
}

/**
 * Decode the recipient from Velodrome calldata using quote provider context.
 * @returns Recipient address baked into the calldata.
 * @throws InvalidParamsError when the context is missing or unsupported
 */
export function decodePoolSwapRecipient(
  swapCalldata: Hex,
  providerContext: Record<string, unknown> | undefined,
): Address {
  if (isCLProviderContext(providerContext)) {
    return decodeCLSwapRecipient(swapCalldata)
  }

  const routerType = providerContext?.routerType
  if (isVelodromeRouterType(routerType)) {
    return decodeSwapRecipient(swapCalldata, routerType)
  }

  throw new InvalidParamsError({
    param: 'providerContext',
    expected: 'Velodrome quote context with tickSpacing or routerType',
  })
}

export function decodePoolSwapSummary(
  swapCalldata: Hex,
  poolConfig: ResolvedPoolConfig,
  routerType: VelodromeRouterType,
): VelodromePoolSwapSummary {
  if (poolConfig.type === 'cl') {
    return decodeCLSwapSummary(swapCalldata)
  }
  return decodeSwapSummary(swapCalldata, routerType)
}

function isCLProviderContext(
  providerContext: Record<string, unknown> | undefined,
): providerContext is Record<string, unknown> & { tickSpacing: number } {
  return typeof providerContext?.tickSpacing === 'number'
}

function isVelodromeRouterType(value: unknown): value is VelodromeRouterType {
  return value === 'universal' || value === 'v2' || value === 'leaf'
}
