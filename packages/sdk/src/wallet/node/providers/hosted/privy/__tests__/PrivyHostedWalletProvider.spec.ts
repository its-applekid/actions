import * as PrivyNodeViem from '@privy-io/node/viem'
import * as Viem from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createPrivyKeyRegistry,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { createMockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'

vi.mock('@privy-io/node/viem', async () => {
  const actual = await vi.importActual<typeof PrivyNodeViem>(
    '@privy-io/node/viem',
  )
  return {
    ...actual,
    createViemAccount: vi.fn(),
  }
})

describe('PrivyHostedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager
  // Resolves walletId -> real signing key, while reporting the caller's address.
  const privyKeys = createPrivyKeyRegistry()

  function newProvider(actionProviders = {}): PrivyHostedWalletProvider {
    return new PrivyHostedWalletProvider({
      privyClient: createMockPrivyClient('app', 'secret'),
      authorizationContext: getMockAuthorizationContext(),
      chainManager: mockChainManager,
      actionProviders,
      actionSettings: {},
    })
  }

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

  describe('toActionsWallet', () => {
    it('creates an ActionsWallet with reconciled address and signer', async () => {
      const walletId = 'wallet-to-actions'
      const address = privyKeys.addressFor(walletId)

      const actionsWallet = await newProvider().toActionsWallet({
        walletId,
        address,
      })

      expect(actionsWallet).toBeInstanceOf(Wallet)
      expect(actionsWallet.address).toBe(address)
      expect(actionsWallet.signer.address).toBe(address)
    })

    it('forwards normalized params to PrivyWallet.create', async () => {
      const walletId = 'wallet-forward'
      const address = privyKeys.addressFor(walletId)
      const spy = vi.spyOn(PrivyWallet, 'create')

      await newProvider().toActionsWallet({
        walletId,
        address: `0x${address.slice(2).toLowerCase()}`,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId,
          address: Viem.getAddress(address),
          chainManager: mockChainManager,
        }),
      )
    })

    it('throws on invalid address', async () => {
      await expect(
        newProvider().toActionsWallet({
          walletId: 'id',
          address: '0x123',
        }),
      ).rejects.toBeTruthy()
    })

    it('forwards lendProvider when provided to constructor', async () => {
      const mockLendProvider = createMockLendProvider()
      const provider = newProvider({ lend: { morpho: mockLendProvider } })
      const spy = vi.spyOn(PrivyWallet, 'create')

      const walletId = 'wallet-lend'
      await provider.toActionsWallet({
        walletId,
        address: privyKeys.addressFor(walletId),
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionProviders: expect.objectContaining({
            lend: { morpho: mockLendProvider },
          }),
        }),
      )
    })
  })

  describe('createSigner', () => {
    it('reconciles and returns a LocalAccount for a matching pair', async () => {
      const walletId = 'signer-matched'
      const address = privyKeys.addressFor(walletId)

      const signer = await newProvider().createSigner({ walletId, address })

      expect(signer.address).toBe(address)
      expect(signer.type).toBe('local')
    })

    it('throws when the (walletId, address) pair does not correspond', async () => {
      const walletId = 'signer-a'
      const wrongAddress = privyKeys.addressFor('signer-b')

      await expect(
        newProvider().createSigner({ walletId, address: wrongAddress }),
      ).rejects.toThrow(SignerAddressMismatchError)
    })
  })
})
