import type { PrivyClient } from '@privy-io/node'
import { createViemAccount } from '@privy-io/node/viem'
import type { Address } from 'viem'
import { getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createMockPrivyWallet,
  createPrivyKeyRegistry,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { createDivergingAccount, getRandomAddress } from '@/__mocks__/utils.js'
import { MockBorrowProvider } from '@/actions/borrow/__mocks__/MockBorrowProvider.js'
import { createMockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SignerAddressMismatchError } from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { ActionSettingsMap } from '@/types/actionRegistry.js'
import type { BorrowSettings } from '@/types/actions.js'
import { WalletNamespace } from '@/wallet/core/namespace/WalletNamespace.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { SmartWalletDeploymentError } from '@/wallet/core/wallets/smart/error/errors.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'

vi.mock('@privy-io/node/viem', () => ({
  createViemAccount: vi.fn(),
}))

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()
const privyKeys = createPrivyKeyRegistry()

describe('WalletNamespace', () => {
  let mockPrivyClient: PrivyClient
  beforeEach(() => {
    mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
    vi.mocked(createViemAccount).mockImplementation((_client, params) =>
      privyKeys.accountFor(
        (params as { walletId: string }).walletId,
        (params as { address: Address }).address,
      ),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('hostedWalletProvider', () => {
    it('should provide access to hosted wallet provider', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        chainManager: mockChainManager,
        authorizationContext: getMockAuthorizationContext(),
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      expect(await walletNamespace.hostedWalletProvider()).toBe(
        hostedWalletProvider,
      )
    })
  })

  describe('smartWalletProvider', () => {
    it('should provide access to smart wallet provider', async () => {
      const mockPrivyClient = createMockPrivyClient(
        'test-app-id',
        'test-app-secret',
      )
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      expect(await walletNamespace.smartWalletProvider()).toBe(
        smartWalletProvider,
      )
    })
  })

  describe('createSmartWallet', () => {
    it('should create a smart wallet and return deployment result', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      // Create a hosted wallet to use as signer
      const privyWallet = createMatchedPrivyWallet()
      const hostedWallet =
        await walletProvider.hostedWalletProvider!.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const signers = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(123)

      const result = await walletNamespace.createSmartWallet({
        signers,
        signer: hostedWallet.signer,
        nonce,
      })

      expect(result.wallet).toBeInstanceOf(DefaultSmartWallet)
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        signers,
        signer: hostedWallet.signer,
        nonce,
      })
    })

    it('should report deployment successes and failures', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      // Create a hosted wallet to use as signer
      const privyWallet = createMatchedPrivyWallet()
      const hostedWallet =
        await walletProvider.hostedWalletProvider!.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const signers = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(456)
      const deploymentChainIds = [130] as SupportedChainId[]

      // Mock the provider's createSmartWallet to return successes and failures
      const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
      const mockWallet = {} as DefaultSmartWallet

      createSmartWalletSpy.mockResolvedValueOnce({
        wallet: mockWallet,
        deployments: [
          { chainId: 130, receipt: undefined, success: true },
          {
            chainId: 8453,
            error: new SmartWalletDeploymentError(
              'Deployment failed on chain 8453',
              8453,
            ),
            success: false,
          },
        ],
      })

      const result = await walletNamespace.createSmartWallet({
        signers,
        signer: hostedWallet.signer,
        nonce,
        deploymentChainIds,
      })

      // Verify it was called with correct params
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        signers,
        signer: hostedWallet.signer,
        nonce,
        deploymentChainIds,
      })

      // Verify we have successes and failures
      expect(result).toEqual({
        wallet: mockWallet,
        deployments: [
          { chainId: 130, receipt: undefined, success: true },
          {
            chainId: 8453,
            error: new SmartWalletDeploymentError(
              'Deployment failed on chain 8453',
              8453,
            ),
            success: false,
          },
        ],
      })
    })
  })

  describe('getSmartWallet', () => {
    it('should get a smart wallet with provided signer', async () => {
      const mockPrivyClient = createMockPrivyClient(
        'test-app-id',
        'test-app-secret',
      )
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const getSmartWalletSpy = vi.spyOn(walletProvider, 'getSmartWallet')
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const privyWallet = createMatchedPrivyWallet()
      const hostedWallet =
        await walletProvider.hostedWalletProvider!.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const deploymentSigners = [hostedWallet.address, getRandomAddress()]
      const nonce = BigInt(789)
      const params = {
        signer: hostedWallet.signer,
        deploymentSigners,
        signers: [hostedWallet.signer.address],
        nonce,
      }

      const smartWallet = await walletNamespace.getSmartWallet(params)

      expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
      expect(getSmartWalletSpy).toHaveBeenCalledWith(params)
    })

    it('should throw error when getting smart wallet without required parameters', async () => {
      const mockPrivyClient = createMockPrivyClient(
        'test-app-id',
        'test-app-secret',
      )
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const privyWallet = createMatchedPrivyWallet()
      const hostedWallet =
        await walletProvider.hostedWalletProvider!.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })

      await expect(
        walletNamespace.getSmartWallet({
          signer: hostedWallet.signer,
          signers: [hostedWallet.signer.address],
          // Missing both walletAddress and deploymentSigners
        }),
      ).rejects.toThrow(
        'Either walletAddress or deploymentSigners array must be provided to locate the smart wallet',
      )
    })
  })

  describe('toActionsWallet', () => {
    it('should convert a hosted wallet to an Actions wallet', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const privyWallet = createMatchedPrivyWallet()
      const hostedWallet =
        await walletProvider.hostedWalletProvider!.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const toActionsWalletSpy = vi.spyOn(
        walletProvider.hostedWalletProvider!,
        'toActionsWallet',
      )

      const actionsWallet = await walletNamespace.toActionsWallet({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })

      expect(toActionsWalletSpy).toHaveBeenCalledWith({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })
      expect(actionsWallet).toBeInstanceOf(Wallet)
      expect(actionsWallet.signer.address).toBe(hostedWallet.signer.address)
      expect(actionsWallet.address).toBe(hostedWallet.address)
    })
  })

  describe('toActionsWallet with LocalAccount', () => {
    it('should create a LocalWallet from a viem LocalAccount', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.address).toBe(account.address)
      expect(wallet.signer).toBe(account)
    })

    it('does not silently route a divergent hosted-derived signer to LocalWallet (F215)', async () => {
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      // A hosted-derived signer is `type: 'local'`, so it routes through the
      // LocalAccount branch. One whose key cannot sign for its reported address
      // must be rejected, not silently wrapped in a usable LocalWallet.
      const divergent = createDivergingAccount(getRandomAddress())

      const error = await walletNamespace
        .toActionsWallet(divergent)
        .catch((e: unknown) => e)

      expect((error as Error).cause).toBeInstanceOf(SignerAddressMismatchError)
    })

    it('should expose lend namespace when an Aave provider is configured', async () => {
      const mockAaveProvider = createMockLendProvider()
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { aave: mockAaveProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: { lend: { aave: mockAaveProvider } },
        actionSettings: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.lend).toBeDefined()
    })

    it('should accept a LocalAccount when no hosted wallet provider is configured', async () => {
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.address).toBe(account.address)
      expect(wallet.signer).toBe(account)
    })

    it('should expose borrow namespace when a borrow provider is configured', async () => {
      const mockBorrowProvider = new MockBorrowProvider()
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: { borrow: { morpho: mockBorrowProvider } },
        actionSettings: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.borrow).toBeDefined()
      expect(wallet.has('borrow')).toBe(true)
    })

    it('should preserve borrow settings on LocalWallet creation', async () => {
      const borrowSettings: BorrowSettings = {
        quoteExpirationSeconds: 90,
        healthBufferPct: 0.02,
      }
      const mockBorrowProvider = new MockBorrowProvider()
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: { borrow: { morpho: mockBorrowProvider } },
        actionSettings: { borrow: borrowSettings },
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)
      const actionSettings = (
        wallet as Wallet & { actionSettings: ActionSettingsMap }
      ).actionSettings

      expect(actionSettings.borrow).toEqual(borrowSettings)
    })
  })

  describe('createSigner', () => {
    it('should delegate to hosted wallet provider createSigner', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const createSignerSpy = vi.spyOn(walletProvider, 'createSigner')
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const privyWallet = createMatchedPrivyWallet()
      const params = {
        walletId: privyWallet.id,
        address: getAddress(privyWallet.address),
      }

      const signer = await walletNamespace.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith(params)
      expect(signer.address).toBe(privyWallet.address)
      expect(signer.type).toBe('local')
    })

    it('should return a LocalAccount that can be used as a smart wallet signer', async () => {
      const hostedWalletProvider = new PrivyHostedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
      })
      const smartWalletProvider = new DefaultSmartWalletProvider({
        chainManager: mockChainManager,
        actionProviders: { lend: { morpho: mockLendProvider } },
        actionSettings: {},
      })
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        actionProviders: {},
        actionSettings: {},
        supportedAssets: [],
      })

      const privyWallet = createMatchedPrivyWallet()
      const signer = await walletNamespace.createSigner({
        walletId: privyWallet.id,
        address: getAddress(privyWallet.address),
      })

      // Use the signer to create a smart wallet
      const signers = [signer.address, getRandomAddress()]
      const { wallet: smartWallet } = await walletNamespace.createSmartWallet({
        signers,
        signer,
        nonce: 0n,
      })

      expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
      expect(smartWallet.signer).toBe(signer)
    })
  })
})

function createMatchedPrivyWallet(id = 'mock-wallet-1') {
  return createMockPrivyWallet({
    id,
    address: privyKeys.addressFor(id),
  })
}
