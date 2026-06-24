import { isEthereumWallet } from '@dynamic-labs/ethereum'
import * as Viem from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDivergingAccount,
  createSigningAccount,
  getRandomAddress,
} from '@/__mocks__/utils.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'
import { DynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof Viem>('viem')
  return {
    ...actual,
    createWalletClient: vi.fn(),
  }
})

vi.mock('@dynamic-labs/ethereum', () => ({
  isEthereumWallet: vi.fn().mockReturnValue(true),
}))

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager

interface MockDynamicWalletOptions {
  walletClientAccount?: Viem.LocalAccount
  rawSigningAccount?: Viem.LocalAccount
}

function normalizeRawHash(message: string): Viem.Hex {
  const hash = message.startsWith('0x') ? message : `0x${message}`
  if (!Viem.isHex(hash)) throw new Error('Expected Dynamic raw message hash')
  return hash
}

function signRawHash(
  account: Viem.LocalAccount,
  hash: Viem.Hex,
): Promise<Viem.Hex> {
  if (!account.sign) {
    throw new Error('Mock Dynamic account does not support raw hash signing')
  }
  return account.sign({ hash })
}

function createMockDynamicWallet({
  walletClientAccount = createSigningAccount(),
  rawSigningAccount = walletClientAccount,
}: MockDynamicWalletOptions = {}): DynamicHostedWalletToActionsWalletOptions['wallet'] & {
  __mock: { connector: { signRawMessage: ReturnType<typeof vi.fn> } }
} {
  const mockConnector = {
    signRawMessage: vi.fn(
      ({ message }: { accountAddress: Viem.Address; message: string }) =>
        signRawHash(rawSigningAccount, normalizeRawHash(message)),
    ),
  }
  const mockWalletClient = {
    account: { address: walletClientAccount.address },
    signMessage: walletClientAccount.signMessage,
    signTransaction: walletClientAccount.signTransaction,
    signTypedData: walletClientAccount.signTypedData,
  } as unknown as Viem.WalletClient
  return {
    connector: mockConnector,
    getWalletClient: vi.fn().mockResolvedValue(mockWalletClient),
    __mock: { connector: mockConnector },
  } as never
}

describe('DynamicWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isEthereumWallet).mockReturnValue(true)
  })

  it('should initialize and reconcile signer and address from dynamic wallet', async () => {
    const dynamic = createMockDynamicWallet()

    const wallet = await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    })

    expect(wallet.signer.type).toBe('local')
    expect(dynamic.getWalletClient).toHaveBeenCalled()
  })

  it('wires the signer to connector.signRawMessage with the 0x prefix trimmed', async () => {
    const dynamic = createMockDynamicWallet()
    const wallet = await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    })

    await wallet.signer.sign!({ hash: '0xdeadbeef' })
    expect(dynamic.__mock.connector.signRawMessage).toHaveBeenCalledWith({
      accountAddress: wallet.address,
      message: 'deadbeef',
    })

    await wallet.signer.sign!({ hash: 'cafebabe' as Viem.Hash })
    expect(dynamic.__mock.connector.signRawMessage).toHaveBeenCalledWith({
      accountAddress: wallet.address,
      message: 'cafebabe',
    })
  })

  it('throws at construction when the reported address diverges from the signing backend', async () => {
    const dynamic = createMockDynamicWallet({
      walletClientAccount: createDivergingAccount(getRandomAddress()),
    })

    await expect(
      DynamicWallet.create({
        dynamicWallet: dynamic,
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })

  it('throws when the raw connector signer differs from walletClient.signMessage', async () => {
    const dynamic = createMockDynamicWallet({
      walletClientAccount: createSigningAccount(),
      rawSigningAccount: createSigningAccount(),
    })

    await expect(
      DynamicWallet.create({
        dynamicWallet: dynamic,
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })

  it('should create a wallet client with correct configuration', async () => {
    const dynamic = createMockDynamicWallet()
    const wallet = await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    })

    const mockWalletClient = {
      account: wallet.signer,
      address: wallet.address,
    } as unknown as Viem.WalletClient
    vi.mocked(Viem.createWalletClient).mockReturnValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(Viem.createWalletClient).toHaveBeenCalledOnce()
    const args = vi.mocked(Viem.createWalletClient).mock.calls[0][0]
    expect(args.account).toMatchObject({ address: wallet.address })
    expect(args.account).toHaveProperty('nonceManager')
    expect(args.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })

  it('should throw if dynamic wallet is not EVM compatible', async () => {
    const dynamic = createMockDynamicWallet()
    vi.mocked(isEthereumWallet).mockReturnValueOnce(false)

    const error = await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    }).catch((e: unknown) => e)

    expect((error as Error).message).toBe('Failed to initialize wallet')
    expect((error as Error).cause).toBeInstanceOf(Error)
    expect(((error as Error).cause as Error).message).toBe(
      'Wallet not connected or not EVM compatible',
    )
  })
})
