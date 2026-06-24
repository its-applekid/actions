import { createViemAccount } from '@privy-io/node/viem'
import type { LocalAccount } from 'viem'

import { normalizeAddress } from '@/utils/validation.js'
import { reconcileSignerAddress } from '@/wallet/core/utils/reconcileSignerAddress.js'
import type {
  NodeOptionsMap,
  PrivyHostedWalletToActionsWalletOptions,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Create a LocalAccount from a Privy wallet
 * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Privy's signing infrastructure
 * under the hood while providing a standard viem interface. The caller-supplied
 * `address` is validated, normalized, and reconciled against the wallet's signing
 * key, so a `(walletId, address)` pair that does not correspond fails at
 * construction instead of silently signing for the wrong account.
 * @param params.walletId - Privy wallet identifier
 * @param params.address - Ethereum address of the wallet
 * @param params.privyClient - Privy client instance
 * @param params.authorizationContext - Optional authorization context for the Privy client.
 * Used when Privy needs to sign requests.
 * See https://docs.privy.io/controls/authorization-keys/using-owners/sign/automatic#using-the-authorization-context
 * for more information on building and using the authorization context.
 * @returns Promise resolving to a reconciled LocalAccount configured for signing operations
 * @throws SignerAddressMismatchError if the signing key does not control the reported address
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export async function createSigner(
  params: PrivyHostedWalletToActionsWalletOptions & NodeOptionsMap['privy'],
): Promise<LocalAccount> {
  const { walletId, address, privyClient, authorizationContext } = params
  const account = createViemAccount(privyClient, {
    walletId,
    address: normalizeAddress(address, 'address'),
    authorizationContext,
  })
  return reconcileSignerAddress(account)
}
