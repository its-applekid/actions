import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type { Wallet } from '@dynamic-labs/wallet-connector-core'
import { describe, expect, it, vi } from 'vitest'

import {
  createDivergingAccount,
  createSigningAccount,
  getRandomAddress,
} from '@/__mocks__/utils.js'
import {
  InvalidParamsError,
  SignerAddressMismatchError,
} from '@/core/error/errors.js'
import { createMockDynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/__mocks__/DynamicWalletTestUtils.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

vi.mock('@dynamic-labs/ethereum', async () => ({
  isEthereumWallet: vi.fn(),
}))

describe('createSigner (React Dynamic)', () => {
  it('reconciles the connector-backed account and returns a signer', async () => {
    vi.mocked(isEthereumWallet).mockReturnValue(true)
    const wallet = createMockDynamicWallet()

    const signer = await createSigner({ wallet })

    expect(isEthereumWallet).toHaveBeenCalledWith(wallet)
    expect(signer.type).toBe('local')
  })

  it('throws when walletClient.account.address is not controlled by the signing backend', async () => {
    vi.mocked(isEthereumWallet).mockReturnValue(true)
    const wallet = createMockDynamicWallet({
      walletClientAccount: createDivergingAccount(getRandomAddress()),
    })

    await expect(createSigner({ wallet })).rejects.toBeInstanceOf(
      SignerAddressMismatchError,
    )
  })

  it('throws when the connector raw signer differs from walletClient.signMessage', async () => {
    vi.mocked(isEthereumWallet).mockReturnValue(true)
    const wallet = createMockDynamicWallet({
      walletClientAccount: createSigningAccount(),
      rawSigningAccount: createSigningAccount(),
    })

    await expect(createSigner({ wallet })).rejects.toBeInstanceOf(
      SignerAddressMismatchError,
    )
  })

  it('throws when walletClient.signMessage differs from the raw connector signer', async () => {
    vi.mocked(isEthereumWallet).mockReturnValue(true)
    const walletClientAccount = createSigningAccount()
    const wallet = createMockDynamicWallet({
      walletClientAccount,
      messageSigningAccount: createSigningAccount(),
      rawSigningAccount: walletClientAccount,
    })

    await expect(createSigner({ wallet })).rejects.toBeInstanceOf(
      SignerAddressMismatchError,
    )
  })

  it('should throw error for non-Ethereum wallet', async () => {
    vi.mocked(isEthereumWallet).mockReturnValue(false)

    await expect(
      createSigner({ wallet: {} as unknown as Wallet }),
    ).rejects.toBeInstanceOf(InvalidParamsError)
  })
})
