import {
  type EnsName,
  isEnsName,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'
import { type Address, getAddress, isAddress } from 'viem'
import { mainnet } from 'viem/chains'

import { CliError } from '@/output/errors.js'

/**
 * Require operator-configured Ethereum mainnet before ENS reads.
 * Avoids falling back to an untrusted public RPC from the CLI.
 * @throws `CliError` with code `config` when mainnet is not configured.
 */
export function requireMainnet(config: NodeActionsConfig<never>): void {
  if (!config.chains.some((chain) => chain.chainId === mainnet.id)) {
    throw new CliError(
      'config',
      'ENS operations require Ethereum mainnet (chain ID 1). ' +
        'Set MAINNET_RPC_URL to a trusted endpoint to enable ENS reads.',
      { chainId: mainnet.id },
    )
  }
}

/**
 * Validate input is ENS-name-shaped before forwarding to the SDK.
 * @returns The input narrowed to `EnsName`.
 * @throws `CliError` with code `validation` when the input is not name-shaped.
 */
export function requireEnsName(input: string): EnsName {
  if (!isEnsName(input)) {
    throw new CliError(
      'validation',
      `Invalid ENS name: "${input}" (expected a dot-separated name, e.g. vitalik.eth)`,
      { input },
    )
  }
  return input
}

/**
 * Validate input is an address before forwarding to reverse lookup.
 * @returns The checksummed `Address`.
 * @throws `CliError` with code `validation` when the input is not an address.
 */
export function requireAddress(input: string): Address {
  if (!isAddress(input)) {
    throw new CliError(
      'validation',
      `Invalid address: "${input}" (expected a 0x-prefixed 20-byte address)`,
      { input },
    )
  }
  return getAddress(input)
}

/**
 * Validate input is either an ENS name or an address for `getInfo`.
 * @returns The input as a checksummed `Address` or an `EnsName`.
 * @throws `CliError` with code `validation` when the input is neither.
 */
export function requireEnsNameOrAddress(input: string): Address | EnsName {
  if (isAddress(input)) return getAddress(input)
  if (isEnsName(input)) return input
  throw new CliError(
    'validation',
    `Invalid input: "${input}" (expected an ENS name or a 0x-prefixed address)`,
    { input },
  )
}
