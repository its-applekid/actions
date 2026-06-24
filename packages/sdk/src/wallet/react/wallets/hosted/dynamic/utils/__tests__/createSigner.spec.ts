import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type { DynamicWaasEVMConnector } from '@dynamic-labs/waas-evm'
import type { Wallet } from '@dynamic-labs/wallet-connector-core'
import type { Hex, LocalAccount, WalletClient } from 'viem'
import { isHex } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  createDivergingAccount,
  createSigningAccount,
  getRandomAddress,
} from '@/__mocks__/utils.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

vi.mock('@dynamic-labs/ethereum', async () => ({
  isEthereumWallet: vi.fn(),
}))

interface MockDynamicWalletOptions {
  walletClientAccount?: LocalAccount
  messageSigningAccount?: LocalAccount
  rawSigningAccount?: LocalAccount
}

function normalizeRawHash(message: string): Hex {
  const hash = message.startsWith('0x') ? message : `0x${message}`
  if (!isHex(hash)) throw new Error('Expected Dynamic raw message hash')
  return hash
}

function signRawHash(account: LocalAccount, hash: Hex): Promise<Hex> {
  if (!account.sign) {
    throw new Error('Mock Dynamic account does not support raw hash signing')
  }
  return account.sign({ hash })
}

function createMockConnector(
  account: LocalAccount,
): Pick<DynamicWaasEVMConnector, 'signRawMessage'> {
  return {
    signRawMessage: vi.fn(
      ({ message }: { accountAddress: string; message: string }) =>
        signRawHash(account, normalizeRawHash(message)),
    ),
  }
}

function createMockDynamicWallet({
  walletClientAccount = createSigningAccount(),
  messageSigningAccount = walletClientAccount,
  rawSigningAccount = walletClientAccount,
}: MockDynamicWalletOptions = {}): Wallet {
  const mockWalletClient = {
    account: { address: walletClientAccount.address },
    signMessage: messageSigningAccount.signMessage,
    signTransaction: messageSigningAccount.signTransaction,
    signTypedData: messageSigningAccount.signTypedData,
  } as unknown as WalletClient
  const mockConnector = createMockConnector(rawSigningAccount)
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
    ).rejects.toThrow('Wallet not connected or not EVM compatible')
  })
})
