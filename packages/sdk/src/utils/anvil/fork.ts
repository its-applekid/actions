import { createPublicClient, http } from 'viem'

import { ForkE2EConfigError } from '@/utils/anvil/errors.js'
import type { ForkHarness, ForkHarnessConfig } from '@/utils/anvil/types.js'
import { startAnvilFork, stopAnvilFork } from '@/utils/test.js'

/**
 * Start or attach to an Anvil fork.
 * @description Uses `rpcUrl` as an already-running shared fork when provided.
 * Otherwise starts a local Anvil process from `forkUrl` on `port`.
 * @param config - Fork chain, RPC, and optional process-start settings.
 * @returns Fork harness with public client, RPC URL, and cleanup callback.
 * @throws ForkE2EConfigError when neither attach nor start settings are usable.
 */
export async function startOrAttachAnvilFork(
  config: ForkHarnessConfig,
): Promise<ForkHarness> {
  if (config.mode === 'attach') return attachFork(config, config.rpcUrl)
  if (config.mode !== 'start') throw new ForkE2EConfigError('Unknown mode.')

  const fork = await startAnvilFork(config.forkUrl, config.port)
  return {
    ...attachFork(config, fork.rpcUrl),
    fork,
    stop: () => stopAnvilFork(fork),
  }
}

function attachFork(config: ForkHarnessConfig, rpcUrl: string): ForkHarness {
  return {
    chain: config.chain,
    chainId: config.chainId,
    publicClient: createPublicClient({
      chain: config.chain,
      transport: http(rpcUrl),
    }),
    rpcUrl,
    stop: () => {},
  }
}
