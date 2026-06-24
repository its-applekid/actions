import type { Address, LocalAccount } from 'viem'
import { getAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

/**
 * @description Generates a fresh checksum address for tests that need a
 * syntactically valid wallet or token address with no stable fixture identity.
 * @returns A random address derived from a generated private key.
 */
export const getRandomAddress = () => {
  return privateKeyToAccount(generatePrivateKey()).address
}

/**
 * @description Creates a signing-capable account whose signatures recover to
 * its reported address. Use this when a test needs a signer that actually
 * controls the address it reports.
 * @returns A randomly generated account with matching reported and recovered addresses.
 */
export const createSigningAccount = (): LocalAccount =>
  privateKeyToAccount(generatePrivateKey())

/**
 * @description Creates an account whose reported address is deliberately
 * different from the address recovered from its signatures. Models a hosted
 * wallet whose reported address and signing backend disagree.
 * @param reportedAddress - Address exposed by the returned account.
 * @returns A signing account that fails signer-address reconciliation.
 */
export const createDivergingAccount = (
  reportedAddress: Address,
): LocalAccount => ({
  ...createSigningAccount(),
  address: getAddress(reportedAddress),
})
