import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireAddress, requireMainnet } from '@/resolvers/ens.js'

/**
 * Handle `actions ens reverse <address>` by reverse-resolving on mainnet.
 * Requires configured mainnet and no signer.
 */
export async function runEnsReverse(address: string): Promise<void> {
  const { actions, config } = baseContext()
  requireMainnet(config)
  const addr = requireAddress(address)
  try {
    const name = await actions.ens.getName(addr)
    printOutput('ensReverse', { address: addr, name })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
