import { getAddress, parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  assertSuccessfulReceipts,
  fundForkWallet,
  getSnapshotBalance,
  runForkWalletSendE2E,
  setupForkActions,
  snapshotTokenBalances,
  startOrAttachAnvilFork,
} from '@/utils/anvil/index.js'
import type { ForkHarness, ForkHarnessConfig } from '@/utils/anvil/types.js'

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
    const before = await snapshotNativeBalance(expectedSingleSendDelta.address)

    const result = await runForkWalletSendE2E(wallet, {
      balanceAssets: [ETH],
      chainId: CHAIN_ID,
      publicClient: fork.publicClient,
      transaction: singleSendTransaction,
    })
    const after = await snapshotNativeBalance(expectedSingleSendDelta.address)

    expect(wallet.address).toBe(account.address)
    expect(result.result).toBeDefined()
    expectBalanceDelta(before, after, expectedSingleSendDelta.amountRaw)
  })

  it('sends an ETH batch through the public EOA wallet API', async () => {
    const { wallet } = await setupFundedEoaWallet()
    const before = await Promise.all(
      expectedBatchSendDeltas.map((delta) =>
        snapshotNativeBalance(delta.address),
      ),
    )

    const receipts = assertSuccessfulReceipts(
      await wallet.sendBatch(batchSendTransactions, CHAIN_ID),
    )
    const after = await Promise.all(
      expectedBatchSendDeltas.map((delta) =>
        snapshotNativeBalance(delta.address),
      ),
    )

    expect(receipts).toHaveLength(batchSendTransactions.length)
    for (const [index, delta] of expectedBatchSendDeltas.entries()) {
      expectBalanceDelta(before[index], after[index], delta.amountRaw)
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

function snapshotNativeBalance(address: `0x${string}`) {
  return snapshotTokenBalances(
    { chainId: CHAIN_ID, publicClient: fork.publicClient },
    address,
    [ETH],
  )
}

function expectBalanceDelta(
  before: Awaited<ReturnType<typeof snapshotNativeBalance>>,
  after: Awaited<ReturnType<typeof snapshotNativeBalance>>,
  expectedDeltaRaw: bigint,
): void {
  expect(getSnapshotBalance(after, ETH) - getSnapshotBalance(before, ETH)).toBe(
    expectedDeltaRaw,
  )
}
