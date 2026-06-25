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
 * Create a signing account whose signatures recover to its reported address.
 * @returns A randomly generated account with matching reported and recovered addresses.
 */
export const createSigningAccount = (): LocalAccount =>
  privateKeyToAccount(generatePrivateKey())

/**
 * Create an account whose reported address differs from its signing key.
 * @returns A signing account that fails signer-address reconciliation.
 */
export const createDivergingAccount = (
  reportedAddress: Address,
): LocalAccount => ({
  ...createSigningAccount(),
  address: getAddress(reportedAddress),
})
