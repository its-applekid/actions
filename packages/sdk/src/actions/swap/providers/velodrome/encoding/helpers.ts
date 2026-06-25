import type { Address, Hex } from 'viem'
import { formatUnits } from 'viem'

import { WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  ChainNotSupportedError,
  InvalidParamsError,
} from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

/**
 * Resolve an asset pair to on-chain token addresses for a given chain.
 * Native ETH is converted to the WETH predeploy address.
 * @param assetIn - Input asset
 * @param assetOut - Output asset
 * @param chainId - Target chain
 * @returns Resolved token addresses
 */
export function resolveTokens(
  assetIn: Asset,
  assetOut: Asset,
  chainId: SupportedChainId,
): { tokenIn: Address; tokenOut: Address } {
  const tokenIn = isNativeAsset(assetIn)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetIn, chainId)
  const tokenOut = isNativeAsset(assetOut)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetOut, chainId)
  return { tokenIn, tokenOut }
}

/**
 * Get the wrapped native token address for a chain.
 * Velodrome routers require WETH in Route structs, not address(0).
 * @param chainId - Target chain
 * @returns WETH address
 * @throws If no WETH address configured for the chain
 */
export function getWrappedNativeAddress(chainId: SupportedChainId): Address {
  const addr = WETH.address[chainId]
  if (!addr || addr === 'native') {
    throw new ChainNotSupportedError({ chainId })
  }
  return addr
}

/**
 * Build a SwapPrice from raw quote data.
 * @param assetIn - Input asset (for decimal conversion)
 * @param assetOut - Output asset (for decimal conversion)
 * @param amountInRaw - Input amount as raw bigint
 * @param amountOutRaw - Output amount as raw bigint
 * @param route - Swap route information
 * @returns SwapPrice with human-readable and raw amounts
 */
export function buildSwapPrice(
  assetIn: Asset,
  assetOut: Asset,
  amountInRaw: bigint,
  amountOutRaw: bigint,
  route: SwapRoute,
): SwapPrice {
  const amountIn = parseFloat(
    formatUnits(amountInRaw, assetIn.metadata.decimals),
  )
  const amountOut = parseFloat(
    formatUnits(amountOutRaw, assetOut.metadata.decimals),
  )
  return {
    price: (amountOut / amountIn).toFixed(6),
    priceInverse: (amountIn / amountOut).toFixed(6),
    amountIn,
    amountOut,
    amountInRaw,
    amountOutRaw,
    priceImpact: 0,
    route,
  }
}

/**
 * Assert Universal Router calldata contains exactly the expected command byte.
 * @throws InvalidParamsError when another command is encoded
 */
export function assertSingleUniversalCommand(
  commands: Hex,
  command: number,
  expected: string,
): void {
  const encodedCommand = `0x${command.toString(16).padStart(2, '0')}`
  if (commands !== encodedCommand) {
    throw new InvalidParamsError({
      param: 'swapCalldata',
      expected,
      received: commands,
    })
  }
}

/**
 * Assert Universal Router calldata contains one input payload for one command.
 * @param inputs - Universal Router input payloads
 * @throws InvalidParamsError when extra or missing inputs are encoded
 */
export function assertSingleUniversalInput(inputs: readonly Hex[]): void {
  if (inputs.length !== 1) {
    throw new InvalidParamsError({
      param: 'swapCalldata',
      expected: 'Universal Router calldata with one input payload',
      received: `${inputs.length} input payloads`,
    })
  }
}

/**
 * Assert Velodrome Universal Router input spends from `msg.sender`.
 * @param payerIsUser - Decoded payer flag from the router input payload
 * @throws InvalidParamsError when calldata expects pre-funded router balances
 */
export function assertUniversalPayerIsUser(payerIsUser: boolean): void {
  if (!payerIsUser) {
    throw new InvalidParamsError({
      param: 'swapCalldata',
      expected: 'Universal Router input with payerIsUser=true',
      received: 'payerIsUser=false',
    })
  }
}
