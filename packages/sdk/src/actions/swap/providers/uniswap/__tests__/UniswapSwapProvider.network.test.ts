import { getAddress, parseEther, parseUnits } from 'viem'
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
import { getAssetAddress } from '@/utils/assets.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'

const CHAIN_ID = optimism.id satisfies SupportedChainId
const FORK_PORT = 18549
const USDC_FUNDING_AMOUNT_RAW = parseUnits('100', USDC.metadata.decimals)
const ETH_FUNDING_AMOUNT_RAW = parseEther('1')
const EXACT_IN_AMOUNT = 10
const OP_USDC_ADDRESS = getAssetAddress(USDC, CHAIN_ID)
const OP_USDC_HOLDER = getAddress('0x9E3ED65340A913B96bA7B86D5D5876dDe623946e')

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
  assetIn: USDC,
  assetOut: ETH,
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

  it('quotes and executes an exact-in USDC to ETH swap', async () => {
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
    expect(result.result.assetIn).toBe(USDC)
    expect(result.result.assetOut).toBe(ETH)
    expect(result.result.amountOutRaw).toBe(quotedAmountOutRaw)
    expectInputBalanceDecreased(result)
    expectOutputBalanceChanged(result)
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
    tokens: [
      {
        amountRaw: USDC_FUNDING_AMOUNT_RAW,
        token: OP_USDC_ADDRESS,
        whale: OP_USDC_HOLDER,
      },
    ],
  })
}

type SwapRunResult = Awaited<ReturnType<typeof runForkSwapProviderE2E>>

function expectInputBalanceDecreased(result: SwapRunResult): void {
  expect(getSnapshotBalance(result.after, USDC)).toBeLessThan(
    getSnapshotBalance(result.before, USDC),
  )
}

function expectOutputBalanceChanged(result: SwapRunResult): void {
  expect(getSnapshotBalance(result.after, ETH)).not.toBe(
    getSnapshotBalance(result.before, ETH),
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
