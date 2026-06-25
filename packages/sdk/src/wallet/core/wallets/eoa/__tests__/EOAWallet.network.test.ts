import { getAddress, parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  fundForkWallet,
  getSnapshotBalance,
  runForkWalletBatchSendE2E,
  runForkWalletSendE2E,
  setupForkActions,
  startOrAttachAnvilFork,
} from '@/utils/anvil/index.js'
import type {
  ForkBalanceSnapshot,
  ForkHarness,
  ForkHarnessConfig,
} from '@/utils/anvil/types.js'

const CHAIN_ID = baseSepolia.id satisfies SupportedChainId
const SEND_RECIPIENT = getAddress('0x0000000000000000000000000000000000001001')
const BATCH_RECIPIENT_A = getAddress(
  '0x0000000000000000000000000000000000001002',
)
const BATCH_RECIPIENT_B = getAddress(
  '0x0000000000000000000000000000000000001003',
)
const SINGLE_SEND_VALUE_RAW = parseEther('0.001')
const BATCH_SEND_VALUE_A_RAW = parseEther('0.002')
const BATCH_SEND_VALUE_B_RAW = parseEther('0.003')
const WALLET_FUNDING_AMOUNT_RAW = parseEther('0.01')
const FORK_PORT = 18548

const singleSendTransaction = {
  to: SEND_RECIPIENT,
  value: SINGLE_SEND_VALUE_RAW,
  data: '0x',
} satisfies TransactionData

const batchSendTransactions = [
  {
    to: BATCH_RECIPIENT_A,
    value: BATCH_SEND_VALUE_A_RAW,
    data: '0x',
  },
  {
    to: BATCH_RECIPIENT_B,
    value: BATCH_SEND_VALUE_B_RAW,
    data: '0x',
  },
] satisfies readonly TransactionData[]

const expectedSingleSendDelta = {
  address: SEND_RECIPIENT,
  amountRaw: SINGLE_SEND_VALUE_RAW,
}

const expectedBatchSendDeltas = [
  {
    address: BATCH_RECIPIENT_A,
    amountRaw: BATCH_SEND_VALUE_A_RAW,
  },
  {
    address: BATCH_RECIPIENT_B,
    amountRaw: BATCH_SEND_VALUE_B_RAW,
  },
]

let fork: ForkHarness

describe('EOAWallet standard fork e2e', () => {
  beforeAll(async () => {
    fork = await startOrAttachAnvilFork(buildForkConfig())
  }, 60_000)

  afterAll(() => {
    fork?.stop()
  })

  it('sends ETH through the public EOA wallet API', async () => {
    const { account, wallet } = await setupFundedEoaWallet()

    const result = await runForkWalletSendE2E(wallet, {
      balanceAssets: [ETH],
      chainId: CHAIN_ID,
      publicClient: fork.publicClient,
      snapshotAddresses: [wallet.address, expectedSingleSendDelta.address],
      transaction: singleSendTransaction,
    })

    expect(wallet.address).toBe(account.address)
    expect(result.result).toBeDefined()
    expectNativeBalanceDelta(
      result.beforeSnapshots[1],
      result.afterSnapshots[1],
      expectedSingleSendDelta.amountRaw,
    )
  })

  it('sends an ETH batch through the public EOA wallet API', async () => {
    const { wallet } = await setupFundedEoaWallet()

    const result = await runForkWalletBatchSendE2E(wallet, {
      balanceAssets: [ETH],
      chainId: CHAIN_ID,
      publicClient: fork.publicClient,
      snapshotAddresses: [wallet.address, BATCH_RECIPIENT_A, BATCH_RECIPIENT_B],
      transactions: batchSendTransactions,
    })

    expect(result.result).toHaveLength(batchSendTransactions.length)
    for (const [index, delta] of expectedBatchSendDeltas.entries()) {
      const snapshotIndex = index + 1
      expectNativeBalanceDelta(
        result.beforeSnapshots[snapshotIndex],
        result.afterSnapshots[snapshotIndex],
        delta.amountRaw,
      )
    }
  })
})

function buildForkConfig(): ForkHarnessConfig {
  const rpcUrl = process.env.BASE_SEPOLIA_FORK_RPC
  if (rpcUrl) {
    return {
      chain: baseSepolia,
      chainId: CHAIN_ID,
      mode: 'attach',
      rpcUrl,
    }
  }
  return {
    chain: baseSepolia,
    chainId: CHAIN_ID,
    forkUrl: process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org',
    mode: 'start',
    port: FORK_PORT,
  }
}

async function setupFundedEoaWallet() {
  const setup = await setupForkActions({
    actionsConfig: {
      wallet: {
        smartWalletConfig: {
          provider: { type: 'default' },
        },
      },
    },
    chain: baseSepolia,
    chainId: CHAIN_ID,
    rpcUrl: fork.rpcUrl,
  })

  await fundForkWallet({
    chain: baseSepolia,
    ethAmountRaw: WALLET_FUNDING_AMOUNT_RAW,
    publicClient: fork.publicClient,
    rpcUrl: fork.rpcUrl,
    targetAddress: setup.wallet.address,
  })

  return setup
}

function expectNativeBalanceDelta(
  before: ForkBalanceSnapshot,
  after: ForkBalanceSnapshot,
  expectedDeltaRaw: bigint,
): void {
  expect(getSnapshotBalance(after, ETH) - getSnapshotBalance(before, ETH)).toBe(
    expectedDeltaRaw,
  )
}
