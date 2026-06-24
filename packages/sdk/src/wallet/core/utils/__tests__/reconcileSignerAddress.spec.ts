import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  createDivergingAccount,
  createSigningAccount,
  getRandomAddress,
} from '@/__mocks__/utils.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { reconcileSignerAddress } from '@/wallet/core/utils/reconcileSignerAddress.js'

describe('reconcileSignerAddress', () => {
  it('resolves to the signer when its key recovers to the reported address', async () => {
    const account = createSigningAccount()

    await expect(reconcileSignerAddress(account)).resolves.toBe(account)
  })

  it('throws SignerAddressMismatchError when the key does not recover to the reported address', async () => {
    // Signs with a real key but reports a different, unrelated address.
    const account = createDivergingAccount(getRandomAddress())

    await expect(
      reconcileSignerAddress(account, { verifyTransactionSigner: true }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })

  it('throws when signTransaction recovers to a different key than signMessage', async () => {
    const messageAccount = createSigningAccount()
    const transactionAccount = createSigningAccount()
    const account = {
      ...messageAccount,
      signTransaction: transactionAccount.signTransaction,
    }

    await expect(
      reconcileSignerAddress(account, { verifyTransactionSigner: true }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })

  it('reports both the reported and recovered addresses on the error', async () => {
    const reportedAddress = getRandomAddress()
    const account = createDivergingAccount(reportedAddress)

    const error = await reconcileSignerAddress(account).catch((e) => e)

    expect(error).toBeInstanceOf(SignerAddressMismatchError)
    expect(error.reportedAddress).toBe(getAddress(reportedAddress))
    expect(error.recoveredAddress).not.toBe(getAddress(reportedAddress))
  })

  it('reconciles regardless of the reported address checksum casing', async () => {
    const account = createSigningAccount()
    const lowercased = {
      ...account,
      address: account.address.toLowerCase() as typeof account.address,
    }

    await expect(reconcileSignerAddress(lowercased)).resolves.toBe(lowercased)
  })
})
