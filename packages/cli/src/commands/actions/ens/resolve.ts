import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireEnsName, requireMainnet } from '@/resolvers/ens.js'

/**
 * Handle `actions ens resolve <name>` by forward-resolving on mainnet.
 * Requires configured mainnet and no signer.
 */
export async function runEnsResolve(name: string): Promise<void> {
  const { actions, config } = baseContext()
  requireMainnet(config)
  const ensName = requireEnsName(name)
  try {
    const address = await actions.ens.getAddress(ensName)
    printOutput('ensResolve', { name: ensName, address })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
