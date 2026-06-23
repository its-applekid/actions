import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type { DynamicWaasEVMConnector } from '@dynamic-labs/waas-evm'
import type { Wallet } from '@dynamic-labs/wallet-connector-core'
import type { Address, WalletClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { createSigningAccount, getRandomAddress } from '@/__mocks__/utils.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

vi.mock('@dynamic-labs/ethereum', async () => ({
  isEthereumWallet: vi.fn(),
}))

/**
 * Build a Dynamic wallet whose underlying walletClient signs with a real key
 * but reports `reportedAddress`. Omit `reportedAddress` for a matched wallet.
 */
function createMockDynamicWallet(reportedAddress?: Address): Wallet {
  const key = createSigningAccount()
  const mockWalletClient = {
    account: { address: reportedAddress ?? key.address },
    signMessage: key.signMessage,
    signTransaction: key.signTransaction,
    signTypedData: key.signTypedData,
  } as unknown as WalletClient
  const mockConnector = {
    signRawMessage: vi.fn(),
  } as unknown as DynamicWaasEVMConnector
  return {
    getWalletClient: vi.fn().mockResolvedValue(mockWalletClient),
    connector: mockConnector,
  } as unknown as Wallet
}

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
    const wallet = createMockDynamicWallet(getRandomAddress())

    await expect(createSigner({ wallet })).rejects.toBeInstanceOf(
      SignerAddressMismatchError,
    )
  })

  it('should throw error for non-Ethereum wallet', async () => {
    vi.mocked(isEthereumWallet).mockReturnValue(false)

    await expect(
      createSigner({ wallet: {} as unknown as Wallet }),
    ).rejects.toThrow('Wallet not connected or not EVM compatible')
  })
})
