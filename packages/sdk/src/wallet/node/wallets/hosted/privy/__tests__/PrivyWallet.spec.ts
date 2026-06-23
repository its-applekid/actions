import type { AuthorizationContext } from '@privy-io/node'
import * as PrivyNodeViem from '@privy-io/node/viem'
import * as Viem from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createPrivyKeyRegistry,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof Viem>('viem')
  return {
    ...actual,
    createWalletClient: vi.fn(),
  }
})

vi.mock('@privy-io/node/viem', async () => {
  const actual = await vi.importActual<typeof PrivyNodeViem>(
    '@privy-io/node/viem',
  )
  return {
    ...actual,
    createViemAccount: vi.fn(),
  }
})

const mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
const mockChainManager = new MockChainManager({
  supportedChains: [130], // Unichain
}) as unknown as ChainManager
// Resolves walletId -> real signing key, while reporting the caller's address.
const privyKeys = createPrivyKeyRegistry()

describe('PrivyWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(PrivyNodeViem.createViemAccount).mockImplementation(
      (_client, params) =>
        privyKeys.accountFor(
          (params as { walletId: string }).walletId,
          (params as { address: Viem.Address }).address,
        ),
    )
  })

  it('should return the correct wallet ID', async () => {
    const walletId = 'wallet-id-1'

    const wallet = await createAndInitPrivyWallet({
      walletId,
      address: privyKeys.addressFor(walletId),
    })

    expect(wallet.walletId).toBe(walletId)
  })

  it('should return the correct address', async () => {
    const walletId = 'wallet-id-2'
    const address = privyKeys.addressFor(walletId)

    const wallet = await createAndInitPrivyWallet({
      walletId,
      address: `0x${address.slice(2).toLowerCase()}`,
    })

    expect(wallet.address).toBe(address)
  })

  it('builds and reconciles the signer from the wallet credentials', async () => {
    const walletId = 'wallet-id-3'
    const address = privyKeys.addressFor(walletId)
    const authorizationContext = getMockAuthorizationContext()

    const wallet = await createAndInitPrivyWallet({
      walletId,
      address,
      authorizationContext,
    })

    expect(PrivyNodeViem.createViemAccount).toHaveBeenCalledWith(
      mockPrivyClient,
      {
        walletId,
        address,
        authorizationContext,
      },
    )
    expect(wallet.signer.address).toBe(address)
    expect(wallet.signer.type).toBe('local')
  })

  it('throws at construction when the address does not match the walletId key', async () => {
    const walletId = 'wallet-id-mismatch'
    // The address belongs to a different wallet's key.
    const wrongAddress = privyKeys.addressFor('some-other-wallet')

    // `Wallet.initialize` wraps initialization failures, so the named seam
    // error is surfaced as the cause at construction, not at first signed tx.
    const error = await createAndInitPrivyWallet({
      walletId,
      address: wrongAddress,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).cause).toBeInstanceOf(SignerAddressMismatchError)
  })

  it('should create a wallet client with correct configuration', async () => {
    const walletId = 'wallet-id-4'
    const address = privyKeys.addressFor(walletId)
    const wallet = await createAndInitPrivyWallet({ walletId, address })

    const mockWalletClient = {
      account: wallet.signer,
      address,
    } as unknown as Viem.WalletClient
    vi.mocked(Viem.createWalletClient).mockReturnValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(Viem.createWalletClient).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(Viem.createWalletClient).mock.calls[0][0]
    expect(callArgs.account).toMatchObject({ address })
    expect(callArgs.account).toHaveProperty('nonceManager')
    expect(callArgs.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})

async function createAndInitPrivyWallet(params: {
  walletId: string
  address: Viem.Address
  authorizationContext?: AuthorizationContext
}) {
  const { walletId, address, authorizationContext } = params
  return PrivyWallet.create({
    privyClient: mockPrivyClient,
    authorizationContext: authorizationContext ?? getMockAuthorizationContext(),
    walletId,
    address,
    chainManager: mockChainManager,
    actionProviders: {},
    actionSettings: {},
  })
}
