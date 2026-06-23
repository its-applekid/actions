import { isEthereumWallet } from '@dynamic-labs/ethereum'
import * as Viem from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSigningAccount, getRandomAddress } from '@/__mocks__/utils.js'
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

/**
 * Build a Dynamic wallet whose underlying walletClient signs with a real key
 * but reports `reportedAddress`. Omit `reportedAddress` for a matched wallet.
 */
function createMockDynamicWallet(
  reportedAddress?: Viem.Address,
): DynamicHostedWalletToActionsWalletOptions['wallet'] & {
  __mock: { connector: { signRawMessage: ReturnType<typeof vi.fn> } }
} {
  const key = createSigningAccount()
  const mockConnector = {
    signRawMessage: vi.fn().mockResolvedValue('0xsigned'),
  }
  const mockWalletClient = {
    account: { address: reportedAddress ?? key.address },
    signMessage: key.signMessage,
    signTransaction: key.signTransaction,
    signTypedData: key.signTypedData,
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
    const dynamic = createMockDynamicWallet(getRandomAddress())

    const error = await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    }).catch((e: unknown) => e)

    expect((error as Error).cause).toBeInstanceOf(SignerAddressMismatchError)
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
