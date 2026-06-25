import {
  createWalletClient,
  erc20Abi,
  http,
  isAddress,
  parseEther,
  toHex,
} from 'viem'

import { ForkE2EConfigError } from '@/utils/anvil/errors.js'
import { assertSuccessfulReceipts } from '@/utils/anvil/receipts.js'
import { requestAnvilRpc } from '@/utils/anvil/rpc.js'
import type {
  ForkTokenFunding,
  ForkWalletFunding,
} from '@/utils/anvil/types.js'

const DEFAULT_ETH_AMOUNT_RAW = parseEther('1')

/**
 * Fund a wallet on an Anvil fork.
 * @description Sets the target ETH balance through Anvil and transfers any
 * requested ERC-20 balances from impersonated whale accounts.
 * @param config - Fork funding scenario.
 * @returns Promise that resolves after all funding receipts succeed.
 * @throws ForkE2EConfigError when configured addresses are invalid.
 */
export async function fundForkWallet(config: ForkWalletFunding): Promise<void> {
  assertAddress(config.targetAddress, 'targetAddress')
  for (const token of config.tokens ?? []) assertFundingToken(token)

  await requestAnvilRpc(config.rpcUrl, 'anvil_setBalance', [
    config.targetAddress,
    toHex(config.ethAmountRaw ?? DEFAULT_ETH_AMOUNT_RAW),
  ])
  await Promise.all(
    groupTokensByWhale(config.tokens ?? []).map(({ tokens, whale }) =>
      fundForkWhaleTokens(config, whale, tokens),
    ),
  )
}

async function fundForkWhaleTokens(
  config: ForkWalletFunding,
  whale: `0x${string}`,
  tokens: readonly ForkTokenFunding[],
): Promise<void> {
  await requestAnvilRpc(config.rpcUrl, 'anvil_setBalance', [
    whale,
    toHex(config.whaleEthAmountRaw ?? DEFAULT_ETH_AMOUNT_RAW),
  ])
  await requestAnvilRpc(config.rpcUrl, 'anvil_impersonateAccount', [whale])
  try {
    // Shared-whale transfers must keep one impersonation session alive.
    for (const token of tokens) await transferForkToken(config, token)
  } finally {
    await requestAnvilRpc(config.rpcUrl, 'anvil_stopImpersonatingAccount', [
      whale,
    ])
  }
}

function groupTokensByWhale(
  tokens: readonly ForkTokenFunding[],
): Array<{ tokens: readonly ForkTokenFunding[]; whale: `0x${string}` }> {
  const grouped = new Map<`0x${string}`, ForkTokenFunding[]>()
  for (const token of tokens) {
    const group = grouped.get(token.whale) ?? []
    group.push(token)
    grouped.set(token.whale, group)
  }
  return [...grouped].map(([whale, group]) => ({ tokens: group, whale }))
}

async function transferForkToken(
  config: ForkWalletFunding,
  token: ForkTokenFunding,
): Promise<void> {
  const whaleClient = createWalletClient({
    account: token.whale,
    chain: config.chain,
    transport: http(config.rpcUrl),
  })
  const hash = await whaleClient.writeContract({
    address: token.token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [config.targetAddress, token.amountRaw],
  })
  assertSuccessfulReceipts(
    await config.publicClient.waitForTransactionReceipt({ hash }),
  )
}

function assertAddress(value: `0x${string}`, label: string): void {
  if (!isAddress(value)) {
    throw new ForkE2EConfigError(`${label} must be a valid address.`)
  }
}

function assertFundingToken(token: ForkTokenFunding): void {
  assertAddress(token.token, 'token')
  assertAddress(token.whale, 'whale')
}
