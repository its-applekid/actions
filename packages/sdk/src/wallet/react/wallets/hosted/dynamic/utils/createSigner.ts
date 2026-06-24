import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type { Address, Hex, LocalAccount } from 'viem'
import { hashMessage } from 'viem'
import { toAccount } from 'viem/accounts'

import { InvalidParamsError } from '@/core/error/errors.js'
import { normalizeAddress } from '@/utils/validation.js'
import { reconcileSignerAddress } from '@/wallet/core/utils/reconcileSignerAddress.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

interface DynamicRawMessageSigner {
  signRawMessage: (params: {
    accountAddress: Address
    message: string
  }) => Promise<Hex>
}

function isDynamicRawMessageSigner(
  value: unknown,
): value is DynamicRawMessageSigner {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.signRawMessage === 'function'
}

function requireDynamicRawMessageSigner(
  connector: unknown,
): DynamicRawMessageSigner {
  if (isDynamicRawMessageSigner(connector)) return connector
  throw new InvalidParamsError({
    param: 'dynamicWallet.connector',
    expected: 'Dynamic connector with signRawMessage support',
  })
}

function stripHexPrefix(value: Hex): string {
  return value.startsWith('0x') ? value.slice(2) : value
}

/**
 * Create a LocalAccount from a Dynamic wallet
 * @description Converts the Dynamic wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Dynamic's signing infrastructure
 * under the hood while providing a standard viem interface. The wallet client's reported
 * address is validated, normalized, and reconciled against the connector signing
 * backend, so a wallet whose reported address diverges from its key fails at
 * construction instead of silently signing for the wrong account.
 * @param params.dynamicWallet - Dynamic wallet instance
 * @returns Promise resolving to a reconciled LocalAccount configured for signing operations
 * @throws SignerAddressMismatchError if the signing backend does not control the reported address
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export async function createSigner(
  params: DynamicHostedWalletToActionsWalletOptions,
): Promise<LocalAccount> {
  const { wallet } = params
  if (!isEthereumWallet(wallet)) {
    throw new Error('Wallet not connected or not EVM compatible')
  }
  const walletClient = await wallet.getWalletClient()
  const connector = requireDynamicRawMessageSigner(wallet.connector)
  const accountAddress = normalizeAddress(
    walletClient.account.address,
    'walletClient.account.address',
  )
  const account = toAccount({
    address: accountAddress,
    sign: ({ hash }) => {
      return connector.signRawMessage({
        accountAddress,
        message: stripHexPrefix(hash),
      })
    },
    signMessage: walletClient.signMessage,
    signTransaction: walletClient.signTransaction,
    signTypedData: walletClient.signTypedData,
  })
  return reconcileSignerAddress(account, {
    additionalSignSelfTestMessages: [
      (message) =>
        connector.signRawMessage({
          accountAddress,
          message: stripHexPrefix(hashMessage(message)),
        }),
    ],
  })
}
