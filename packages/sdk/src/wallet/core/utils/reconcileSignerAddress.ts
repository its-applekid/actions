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
 * Scoped so it cannot be confused with a user-intended signature.
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
 * Supports additional message signers and transaction-signing verification.
 * @throws SignerAddressMismatchError when the signing key cannot control it.
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
