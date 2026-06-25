import { erc20Abi, isAddressEqual } from 'viem'

import type { Asset } from '@/types/asset.js'
import { ForkE2EConfigError } from '@/utils/anvil/errors.js'
import type {
  ForkBalanceEntry,
  ForkBalanceSnapshot,
  ForkScenarioContext,
} from '@/utils/anvil/types.js'

/**
 * Snapshot token balances for one wallet on a fork.
 * @description Reads native and ERC-20 balances through the supplied fork
 * public client. The returned entries preserve the input asset order.
 * @param context - Fork chain and public client.
 * @param walletAddress - Wallet address to snapshot.
 * @param assets - Assets to read.
 * @returns Balance snapshot for the requested wallet and assets.
 * @throws ForkE2EConfigError when an ERC-20 asset has no address on the chain.
 */
export async function snapshotTokenBalances(
  context: ForkScenarioContext,
  walletAddress: `0x${string}`,
  assets: readonly Asset[],
): Promise<ForkBalanceSnapshot> {
  const balances = await Promise.all(
    assets.map((asset) => snapshotAssetBalance(context, walletAddress, asset)),
  )
  return { address: walletAddress, balances, chainId: context.chainId }
}

/**
 * Read one asset balance from a snapshot.
 * @description Uses asset identity first, then falls back to same-chain asset
 * address matching so callers can use the config object passed into a scenario.
 * @param snapshot - Balance snapshot returned by `snapshotTokenBalances`.
 * @param asset - Asset whose balance should be returned.
 * @returns Balance in base units.
 * @throws ForkE2EConfigError when the snapshot does not include the asset.
 */
export function getSnapshotBalance(
  snapshot: ForkBalanceSnapshot,
  asset: Asset,
): bigint {
  const entry = snapshot.balances.find(
    (balance) =>
      balance.asset === asset || isSameChainAsset(snapshot, balance, asset),
  )
  if (!entry) {
    throw new ForkE2EConfigError(
      `Snapshot does not include ${asset.metadata.symbol}.`,
    )
  }
  return entry.balanceRaw
}

function isSameChainAsset(
  snapshot: ForkBalanceSnapshot,
  entry: ForkBalanceEntry,
  asset: Asset,
): boolean {
  const left = entry.asset.address[snapshot.chainId]
  const right = asset.address[snapshot.chainId]
  if (!left || !right) return false
  if (left === 'native' || right === 'native') return left === right
  return isAddressEqual(left, right)
}

async function snapshotAssetBalance(
  context: ForkScenarioContext,
  walletAddress: `0x${string}`,
  asset: Asset,
): Promise<ForkBalanceEntry> {
  if (asset.type === 'native') {
    return {
      asset,
      balanceRaw: await context.publicClient.getBalance({
        address: walletAddress,
      }),
    }
  }
  return snapshotErc20Balance(context, walletAddress, asset)
}

async function snapshotErc20Balance(
  context: ForkScenarioContext,
  walletAddress: `0x${string}`,
  asset: Asset,
): Promise<ForkBalanceEntry> {
  const address = asset.address[context.chainId]
  if (!address || address === 'native') {
    throw new ForkE2EConfigError(
      `${asset.metadata.symbol} has no ERC-20 address on ${context.chainId}.`,
    )
  }
  const balanceRaw = await context.publicClient.readContract({
    address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })
  return { asset, balanceRaw }
}
