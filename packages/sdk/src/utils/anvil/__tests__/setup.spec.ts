import { unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  CHAIN_ID,
  RPC_URL,
  WALLET_ADDRESS,
} from '@/utils/anvil/__tests__/fixtures.js'
import {
  buildForkActionsConfig,
  setupForkActions,
  startOrAttachAnvilFork,
} from '@/utils/anvil/index.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'

const BASE_ACTIONS_CONFIG = {
  wallet: { smartWalletConfig: { provider: { type: 'default' } } },
} satisfies Parameters<typeof buildForkActionsConfig>[0]['actionsConfig']

describe('anvil setup helpers', () => {
  it('attaches to an existing Anvil fork when rpcUrl is provided', async () => {
    const harness = await startOrAttachAnvilFork({
      chain: unichain,
      chainId: CHAIN_ID,
      mode: 'attach',
      rpcUrl: RPC_URL,
    })

    expect(harness.rpcUrl).toBe(RPC_URL)
    expect(harness.chainId).toBe(CHAIN_ID)
    expect(harness.fork).toBeUndefined()
    harness.stop()
  })

  it('builds a fork ActionsConfig and local Actions wallet', async () => {
    const scenario = {
      actionsConfig: BASE_ACTIONS_CONFIG,
      chain: unichain,
      chainId: CHAIN_ID,
      privateKey: ANVIL_ACCOUNTS.ACCOUNT_0,
      rpcUrl: RPC_URL,
    }

    const config = buildForkActionsConfig(scenario)
    const setup = await setupForkActions(scenario)

    expect(config.chains).toEqual([{ chainId: CHAIN_ID, rpcUrls: [RPC_URL] }])
    expect(setup.account.address).toBe(WALLET_ADDRESS)
    expect(setup.wallet.address).toBe(WALLET_ADDRESS)
  })
})
