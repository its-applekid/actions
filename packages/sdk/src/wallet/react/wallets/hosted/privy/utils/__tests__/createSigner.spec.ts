import * as PrivyReactAuth from '@privy-io/react-auth'
import { describe, expect, it, vi } from 'vitest'

import {
  createDivergingAccount,
  createSigningAccount,
  getRandomAddress,
} from '@/__mocks__/utils.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { createSigner } from '@/wallet/react/wallets/hosted/privy/utils/createSigner.js'

vi.mock('@privy-io/react-auth', async () => {
  const actual = await vi.importActual<typeof PrivyReactAuth>(
    '@privy-io/react-auth',
  )
  return {
    ...actual,
    toViemAccount: vi.fn(),
  }
})

const mockConnectedWallet = {
  walletClientType: 'privy',
} as unknown as PrivyReactAuth.ConnectedWallet

type PrivyViemAccount = Awaited<ReturnType<typeof PrivyReactAuth.toViemAccount>>

describe('createSigner (React Privy)', () => {
  it('reconciles the re-wrapped vendor account and returns a signer', async () => {
    const vendorAccount = createSigningAccount()
    vi.mocked(PrivyReactAuth.toViemAccount).mockResolvedValue(
      vendorAccount as unknown as PrivyViemAccount,
    )

    const signer = await createSigner({ connectedWallet: mockConnectedWallet })

    expect(PrivyReactAuth.toViemAccount).toHaveBeenCalledWith({
      wallet: mockConnectedWallet,
    })
    expect(signer.address).toBe(vendorAccount.address)
    expect(signer.type).toBe('local')
  })

  it('throws when the vendor account reports an address its key cannot sign for', async () => {
    // Re-wrapped vendor account whose reported address diverges from its key.
    const vendorAccount = createDivergingAccount(getRandomAddress())
    vi.mocked(PrivyReactAuth.toViemAccount).mockResolvedValue(
      vendorAccount as unknown as PrivyViemAccount,
    )

    await expect(
      createSigner({ connectedWallet: mockConnectedWallet }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })
})
