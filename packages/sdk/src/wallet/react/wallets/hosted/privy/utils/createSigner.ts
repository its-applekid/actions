import { toViemAccount } from '@privy-io/react-auth'
import type { CustomSource, LocalAccount } from 'viem'
import { getAddress } from 'viem'
import { toAccount } from 'viem/accounts'

import { reconcileSignerAddress } from '@/wallet/core/utils/reconcileSignerAddress.js'
import type { PrivyHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Create a LocalAccount from a Privy wallet
 * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Privy's signing infrastructure
 * under the hood while providing a standard viem interface. The vendor's reported
 * address is normalized through `getAddress` and reconciled against the account's
 * signing key, so a re-wrapped account whose reported address diverges from its key
 * fails at construction instead of silently signing for the wrong account.
 * @param params.connectedWallet - Privy connected wallet
 * @returns Promise resolving to a reconciled LocalAccount configured for signing operations
 * @throws SignerAddressMismatchError if the signing key does not control the reported address
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export async function createSigner(
  params: PrivyHostedWalletToActionsWalletOptions,
): Promise<LocalAccount> {
  const privyViemAccount = await toViemAccount({
    wallet: params.connectedWallet,
  })
  const account = toAccount({
    address: getAddress(privyViemAccount.address),
    sign: privyViemAccount.sign,
    signMessage: privyViemAccount.signMessage,
    signTransaction: privyViemAccount.signTransaction,
    signTypedData:
      privyViemAccount.signTypedData as CustomSource['signTypedData'],
  })
  return reconcileSignerAddress(account)
}
