import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import type { NodeActionsConfig } from '@/nodeActionsFactory.js'
import { createActions } from '@/nodeActionsFactory.js'
import type { ForkActionsScenario } from '@/utils/anvil/types.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { NodeProviderTypes } from '@/wallet/node/providers/hosted/types/index.js'

export interface ForkActionsSetup<
  THostedWalletProviderType extends NodeProviderTypes = NodeProviderTypes,
> {
  account: NonNullable<
    ForkActionsScenario<THostedWalletProviderType>['account']
  >
  actions: ReturnType<typeof createActions<THostedWalletProviderType>>
  publicClient: ReturnType<typeof createPublicClient>
  wallet: Wallet
}

/**
 * Build an ActionsConfig for a fork scenario.
 * @description Fills the scenario's fork RPC into `chains` unless the caller
 * provided a custom chain list.
 * @param scenario - Fork SDK setup scenario.
 * @returns ActionsConfig ready for the Node SDK factory.
 */
export function buildForkActionsConfig<
  THostedWalletProviderType extends NodeProviderTypes = NodeProviderTypes,
>(
  scenario: ForkActionsScenario<THostedWalletProviderType>,
): NodeActionsConfig<THostedWalletProviderType> {
  return {
    ...scenario.actionsConfig,
    chains: scenario.actionsConfig.chains ?? [
      { chainId: scenario.chainId, rpcUrls: [scenario.rpcUrl] },
    ],
  }
}

/**
 * Create real SDK Actions and an EOA wallet for a fork scenario.
 * @description Instantiates the Node SDK from an ActionsConfig, creates a
 * local account-backed wallet, and returns a matching public client.
 * @param scenario - Fork SDK setup scenario.
 * @returns Actions instance, wallet, signer account, and public client.
 */
export async function setupForkActions<
  THostedWalletProviderType extends NodeProviderTypes = NodeProviderTypes,
>(
  scenario: ForkActionsScenario<THostedWalletProviderType>,
): Promise<ForkActionsSetup<THostedWalletProviderType>> {
  const account =
    scenario.account ??
    privateKeyToAccount(scenario.privateKey ?? ANVIL_ACCOUNTS.ACCOUNT_0)
  const actions = createActions<THostedWalletProviderType>(
    buildForkActionsConfig(scenario),
  )
  const wallet = await actions.wallet.toActionsWallet(account)
  const publicClient = createPublicClient({
    chain: scenario.chain,
    transport: http(scenario.rpcUrl),
  })

  return { account, actions, publicClient, wallet }
}
