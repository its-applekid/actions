import type {
  Address,
  Hex,
  LocalAccount,
  TransactionSerializableLegacy,
} from 'viem'
import {
  getAddress,
  recoverMessageAddress,
  recoverTransactionAddress,
} from 'viem'

import { SignerAddressMismatchError } from '@/core/error/errors.js'

/**
 * Fixed, domain-separated self-test message signed during reconciliation.
 * @description Scoped to this check so it can never be confused with a
 * user-intended signature. A message recover is sufficient and avoids
 * depending on chain/RPC.
 */
const SIGNER_RECONCILIATION_MESSAGE =
  'actions-sdk:signer-address-reconciliation:v1' as const

const SIGNER_RECONCILIATION_TRANSACTION = {
  chainId: 1,
  type: 'legacy',
  nonce: 0,
  gas: 21_000n,
  gasPrice: 0n,
  to: '0x0000000000000000000000000000000000000001',
  value: 0n,
  data: '0x',
} as const satisfies TransactionSerializableLegacy

type SelfTestMessageSigner = (
  message: typeof SIGNER_RECONCILIATION_MESSAGE,
) => Promise<Hex>

interface ReconcileSignerAddressOptions {
  additionalSignSelfTestMessages?: readonly SelfTestMessageSigner[]
  verifyTransactionSigner?: boolean
}

/**
 * Prove a signer controls the address it reports.
 * @description Shared self-test seam for every hosted wallet provider/wallet.
 * Signs the fixed self-test message with the resolved signer and asserts the
 * recovered address equals `getAddress(signer.address)`. On a mismatch it
 * throws {@link SignerAddressMismatchError} at construction time, before the
 * wallet can build, approve, or sign against an account its key cannot control.
 * The reported address is normalized through `getAddress` so the comparison is
 * checksum-stable. Callers with composed signing backends can provide
 * `additionalSignSelfTestMessages` to reconcile additional message-signing
 * backends used by later signing, or `verifyTransactionSigner` when the SDK
 * will use `signTransaction` for EOA/smart-wallet operations.
 * @param signer - The viem `LocalAccount` to reconcile
 * @param options - Optional signer override for the fixed self-test payload
 * @returns The same `signer`, once reconciled, so callers can chain
 * @throws SignerAddressMismatchError when the signing key does not recover to
 * the reported address
 */
export async function reconcileSignerAddress<T extends LocalAccount>(
  signer: T,
  options: ReconcileSignerAddressOptions = {},
): Promise<T> {
  const reportedAddress = getAddress(signer.address)
  const signSelfTestMessages = [
    (message: typeof SIGNER_RECONCILIATION_MESSAGE) =>
      signer.signMessage({ message }),
    ...(options.additionalSignSelfTestMessages ?? []),
  ]
  await Promise.all(
    signSelfTestMessages.map(async (signSelfTestMessage) => {
      const signature = await signSelfTestMessage(SIGNER_RECONCILIATION_MESSAGE)
      const recoveredAddress = getAddress(
        await recoverMessageAddress({
          message: SIGNER_RECONCILIATION_MESSAGE,
          signature,
        }),
      )
      assertRecoveredAddress({ reportedAddress, recoveredAddress })
    }),
  )
  if (options.verifyTransactionSigner) {
    const recoveredTransactionAddress = getAddress(
      await recoverTransactionAddress({
        serializedTransaction: await signer.signTransaction(
          SIGNER_RECONCILIATION_TRANSACTION,
        ),
      }),
    )
    assertRecoveredAddress({
      reportedAddress,
      recoveredAddress: recoveredTransactionAddress,
    })
  }
  return signer
}

function assertRecoveredAddress(params: {
  reportedAddress: Address
  recoveredAddress: Address
}) {
  if (params.recoveredAddress !== params.reportedAddress) {
    throw new SignerAddressMismatchError(params)
  }
}
