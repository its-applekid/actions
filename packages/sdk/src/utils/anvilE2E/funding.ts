import {
  createWalletClient,
  erc20Abi,
  http,
  isAddress,
  parseEther,
  toHex,
} from 'viem'

import { ForkE2EConfigError } from '@/utils/anvilE2E/errors.js'
import { assertSuccessfulReceipts } from '@/utils/anvilE2E/receipts.js'
import { requestAnvilRpc } from '@/utils/anvilE2E/rpc.js'
import type {
  ForkTokenFunding,
  ForkWalletFunding,
} from '@/utils/anvilE2E/types.js'

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
  await requestAnvilRpc(config.rpcUrl, 'anvil_setBalance', [
    config.targetAddress,
    toHex(config.ethAmountRaw ?? DEFAULT_ETH_AMOUNT_RAW),
  ])
  await Promise.all(
    (config.tokens ?? []).map((token) => fundForkToken(config, token)),
  )
}

async function fundForkToken(
  config: ForkWalletFunding,
  token: ForkTokenFunding,
): Promise<void> {
  assertAddress(token.token, 'token')
  assertAddress(token.whale, 'whale')
  await requestAnvilRpc(config.rpcUrl, 'anvil_setBalance', [
    token.whale,
    toHex(config.whaleEthAmountRaw ?? DEFAULT_ETH_AMOUNT_RAW),
  ])
  await requestAnvilRpc(config.rpcUrl, 'anvil_impersonateAccount', [
    token.whale,
  ])
  try {
    await transferForkToken(config, token)
  } finally {
    await requestAnvilRpc(config.rpcUrl, 'anvil_stopImpersonatingAccount', [
      token.whale,
    ])
  }
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
