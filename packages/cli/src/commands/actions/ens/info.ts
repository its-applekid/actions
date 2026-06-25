import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireEnsNameOrAddress, requireMainnet } from '@/resolvers/ens.js'

/**
 * Handle `actions ens info <input>` by fetching standard ENS profile records.
 * Requires configured mainnet and no signer.
 */
export async function runEnsInfo(input: string): Promise<void> {
  const { actions, config } = baseContext()
  requireMainnet(config)
  const resolved = requireEnsNameOrAddress(input)
  try {
    const info = await actions.ens.getInfo(resolved)
    printOutput('ensInfo', info)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
