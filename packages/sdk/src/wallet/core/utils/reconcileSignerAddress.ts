import type { LocalAccount } from 'viem'
import { getAddress, recoverMessageAddress } from 'viem'

import { SignerAddressMismatchError } from '@/core/error/errors.js'

/**
 * Fixed, domain-separated self-test message signed during reconciliation.
 * @description Scoped to this check so it can never be confused with a
 * user-intended signature. A message recover is sufficient and avoids
 * depending on chain/RPC.
 */
export const SIGNER_RECONCILIATION_MESSAGE =
  'actions-sdk:signer-address-reconciliation:v1' as const

/**
 * Prove a signer controls the address it reports.
 * @description Shared self-test seam for every hosted wallet provider/wallet.
 * Signs {@link SIGNER_RECONCILIATION_MESSAGE} with the resolved signer and
 * asserts the recovered address equals `getAddress(signer.address)`. On a
 * mismatch it throws {@link SignerAddressMismatchError} at construction time,
 * before the wallet can build, approve, or sign against an account its key
 * cannot control. The reported address is normalized through `getAddress` so
 * the comparison is checksum-stable.
 * @param signer - The viem `LocalAccount` to reconcile
 * @returns The same `signer`, once reconciled, so callers can chain
 * @throws SignerAddressMismatchError when the signing key does not recover to
 * the reported address
 */
export async function reconcileSignerAddress<T extends LocalAccount>(
  signer: T,
): Promise<T> {
  const reportedAddress = getAddress(signer.address)
  const signature = await signer.signMessage({
    message: SIGNER_RECONCILIATION_MESSAGE,
  })
  const recoveredAddress = getAddress(
    await recoverMessageAddress({
      message: SIGNER_RECONCILIATION_MESSAGE,
      signature,
    }),
  )
  if (recoveredAddress !== reportedAddress) {
    throw new SignerAddressMismatchError({ reportedAddress, recoveredAddress })
  }
  return signer
}
