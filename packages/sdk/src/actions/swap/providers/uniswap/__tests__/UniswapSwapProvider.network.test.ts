import { parseEther } from 'viem'
import { optimism } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { UniswapSwapProviderConfig } from '@/actions/swap/providers/uniswap/types.js'
import { ETH, USDC } from '@/constants/assets.js'
import { UNISWAP } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  fundForkWallet,
  getSnapshotBalance,
  runForkSwapProviderE2E,
  setupForkActions,
  startOrAttachAnvilFork,
} from '@/utils/anvil/index.js'
import type { ForkHarness, ForkHarnessConfig } from '@/utils/anvil/types.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'

const CHAIN_ID = optimism.id satisfies SupportedChainId
const FORK_PORT = 18549
const ETH_FUNDING_AMOUNT_RAW = parseEther('1')
const EXACT_IN_AMOUNT = 0.01

const uniswapConfig: UniswapSwapProviderConfig = {
  marketAllowlist: [
    {
      chainId: CHAIN_ID,
      assets: [USDC, ETH],
      fee: 500,
      tickSpacing: 10,
    },
  ],
}

const swapParams = {
  assetIn: ETH,
  assetOut: USDC,
  amountIn: EXACT_IN_AMOUNT,
  chainId: CHAIN_ID,
  provider: UNISWAP,
} as const

let fork: ForkHarness

describe('Uniswap standard swap e2e', () => {
  beforeAll(async () => {
    fork = await startOrAttachAnvilFork(buildForkConfig())
  }, 60_000)

  afterAll(() => {
    fork?.stop()
  })

  it('quotes and executes an exact-in ETH to USDC swap', async () => {
    const { wallet } = await setupFundedUniswapWallet()
    const quote = await wallet.swap?.getQuote(swapParams)
    const quotedAmountOutRaw = quote?.amountOutRaw
    expect(quote).toBeDefined()
    expect(quote?.provider).toBe(UNISWAP)
    expect(quotedAmountOutRaw).toBeGreaterThan(0n)

    const result = await runForkSwapProviderE2E(wallet, {
      chainId: CHAIN_ID,
      publicClient: fork.publicClient,
      swap: swapParams,
    })

    expect(result.result.amountIn).toBe(EXACT_IN_AMOUNT)
    expect(result.result.assetIn).toBe(ETH)
    expect(result.result.assetOut).toBe(USDC)
    expect(result.result.amountOutRaw).toBe(quotedAmountOutRaw)
    expectInputBalanceDecreased(result)
    expectOutputBalanceIncreased(result)
  })
})

async function setupFundedUniswapWallet() {
  const setup = await setupForkActions({
    actionsConfig: {
      wallet: { smartWalletConfig: { provider: { type: 'default' } } },
      swap: { uniswap: uniswapConfig },
      assets: { allow: [USDC, ETH] },
    },
    chain: optimism,
    chainId: CHAIN_ID,
    privateKey: ANVIL_ACCOUNTS.ACCOUNT_0,
    rpcUrl: fork.rpcUrl,
  })

  await fundUniswapWallet(setup.wallet.address)
  return setup
}

async function fundUniswapWallet(targetAddress: `0x${string}`): Promise<void> {
  await fundForkWallet({
    chain: optimism,
    ethAmountRaw: ETH_FUNDING_AMOUNT_RAW,
    publicClient: fork.publicClient,
    rpcUrl: fork.rpcUrl,
    targetAddress,
  })
}

type SwapRunResult = Awaited<ReturnType<typeof runForkSwapProviderE2E>>

function expectInputBalanceDecreased(result: SwapRunResult): void {
  expect(getSnapshotBalance(result.after, ETH)).toBeLessThan(
    getSnapshotBalance(result.before, ETH),
  )
}

function expectOutputBalanceIncreased(result: SwapRunResult): void {
  expect(getSnapshotBalance(result.after, USDC)).toBeGreaterThan(
    getSnapshotBalance(result.before, USDC),
  )
}

function buildForkConfig(): ForkHarnessConfig {
  const rpcUrl = process.env.OP_MAINNET_FORK_RPC
  if (rpcUrl) {
    return { chain: optimism, chainId: CHAIN_ID, mode: 'attach', rpcUrl }
  }
  return {
    chain: optimism,
    chainId: CHAIN_ID,
    forkUrl: process.env.OP_MAINNET_RPC ?? 'https://mainnet.optimism.io',
    mode: 'start',
    port: FORK_PORT,
  }
}
