import { EventEmitter } from 'events'
import { unichain } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CHAIN_ID,
  RPC_URL,
  WALLET_ADDRESS,
} from '@/utils/anvil/__tests__/fixtures.js'
import {
  buildForkActionsConfig,
  ForkE2EAnvilStartError,
  setupForkActions,
  startOrAttachAnvilFork,
} from '@/utils/anvil/index.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    spawn: spawnMock,
  }
})

const BASE_ACTIONS_CONFIG = {
  wallet: { smartWalletConfig: { provider: { type: 'default' } } },
} satisfies Parameters<typeof buildForkActionsConfig>[0]['actionsConfig']

describe('anvil setup helpers', () => {
  afterEach(() => {
    spawnMock.mockReset()
    vi.restoreAllMocks()
  })

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

  it('wraps Anvil child-process start failures in a named error', async () => {
    const proc = createChildProcessMock()
    spawnMock.mockReturnValue(proc)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => {}),
    )

    const start = startOrAttachAnvilFork({
      chain: unichain,
      chainId: CHAIN_ID,
      forkUrl: RPC_URL,
      mode: 'start',
      port: 18546,
    })
    proc.emit('error', new Error('spawn anvil ENOENT'))

    await expect(start).rejects.toThrow(ForkE2EAnvilStartError)
    expect(proc.kill).toHaveBeenCalledOnce()
  })

  it('wraps Anvil exits before readiness with exit details', async () => {
    const proc = createChildProcessMock()
    spawnMock.mockReturnValue(proc)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => {}),
    )

    const start = startOrAttachAnvilFork({
      chain: unichain,
      chainId: CHAIN_ID,
      forkUrl: RPC_URL,
      mode: 'start',
      port: 18547,
    })
    proc.emit('exit', 1, null)

    const error = await start.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ForkE2EAnvilStartError)
    if (!(error instanceof ForkE2EAnvilStartError)) return
    expect(error.message).toContain('exit code: 1')
    expect(error.message).toContain('signal: none')
    expect(proc.kill).toHaveBeenCalledOnce()
  })
})

function createChildProcessMock() {
  const proc = new EventEmitter()
  return Object.assign(proc, { kill: vi.fn() })
}
