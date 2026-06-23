import { createAccount } from '@turnkey/viem'
import type { LocalAccount } from 'viem'

import { normalizeOptionalAddress } from '@/utils/validation.js'
import { reconcileSignerAddress } from '@/wallet/core/utils/reconcileSignerAddress.js'
import type {
  NodeOptionsMap,
  TurnkeyHostedWalletToActionsWalletOptions,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Create a viem LocalAccount instance backed by Turnkey
 * @description Wraps the Turnkey SDK's `createAccount` to produce a signing
 * account compatible with viem. Under the hood, this uses the provided
 * `client`, `organizationId`, and `signWith` to authenticate signing requests
 * with Turnkey. If `ethereumAddress` is supplied, it's validated for shape and
 * used directly; otherwise the SDK fetches it from the Turnkey API. The
 * resulting account is reconciled against its signing key, so an
 * `ethereumAddress`/`signWith` pair that does not correspond fails at
 * construction instead of silently signing for the wrong account.
 * @param params.client - Turnkey client instance
 * @param params.organizationId - Turnkey organization ID that owns the signing key
 * @param params.signWith - Wallet account address, private key address, or private key ID
 * @param params.ethereumAddress - Ethereum address to use for this account, in the case that a private key ID is used to sign.
 * @returns Promise resolving to a reconciled viem `LocalAccount` with Turnkey as the signer backend
 * @throws InvalidParamsError if `ethereumAddress` is supplied but malformed
 * @throws SignerAddressMismatchError if the signing key does not control `ethereumAddress`
 */
export async function createSigner(
  params: TurnkeyHostedWalletToActionsWalletOptions & NodeOptionsMap['turnkey'],
): Promise<LocalAccount> {
  const { client, organizationId, signWith, ethereumAddress } = params
  const normalizedEthereumAddress = normalizeOptionalAddress(
    ethereumAddress,
    'ethereumAddress',
  )
  const account = await createAccount({
    client,
    organizationId,
    signWith,
    ethereumAddress: normalizedEthereumAddress,
  })
  return reconcileSignerAddress(account)
}
