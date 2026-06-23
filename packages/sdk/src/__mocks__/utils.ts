import type { Address, LocalAccount } from 'viem'
import { getAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export const getRandomAddress = () => {
  return privateKeyToAccount(generatePrivateKey()).address
}

/**
 * A real, signing-capable viem LocalAccount backed by a fresh random key.
 * Its `signMessage` produces a signature that recovers to its own `.address`,
 * so it passes signer-address reconciliation. Use this anywhere a test needs a
 * signer that actually controls the address it reports.
 */
export const createSigningAccount = (): LocalAccount =>
  privateKeyToAccount(generatePrivateKey())

/**
 * A signing account whose reported `.address` is deliberately replaced with
 * `reportedAddress` while its signing key is left unchanged. Recovering one of
 * its signatures yields the underlying key's real address, not
 * `reportedAddress`, so reconciliation detects the divergence. Models a hosted
 * wallet whose reported address and signing backend disagree.
 */
export const createDivergingAccount = (
  reportedAddress: Address,
): LocalAccount => ({
  ...createSigningAccount(),
  address: getAddress(reportedAddress),
})
