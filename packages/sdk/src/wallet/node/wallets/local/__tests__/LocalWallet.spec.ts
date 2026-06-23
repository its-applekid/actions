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
import { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof Viem>('viem')
  return {
    ...actual,
    createWalletClient: vi.fn(),
  }
})

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager

describe('LocalWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should set signer and address from provided LocalAccount', async () => {
    const account = createSigningAccount()

    const wallet = await LocalWallet.create({
      account,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    })

    expect(wallet.address).toBe(account.address)
    expect(wallet.signer).toBe(account)
  })

  it('throws at construction when the account cannot sign for its reported address', async () => {
    // A hosted-derived signer collision routed in as a bare LocalAccount.
    const account = createDivergingAccount(getRandomAddress())

    const error = await LocalWallet.create({
      account,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    }).catch((e: unknown) => e)

    expect((error as Error).cause).toBeInstanceOf(SignerAddressMismatchError)
  })

  it('should create a wallet client with correct configuration', async () => {
    const account = createSigningAccount()
    const wallet = await LocalWallet.create({
      account,
      chainManager: mockChainManager,
      actionProviders: {},
      actionSettings: {},
    })

    const mockWalletClient = {
      account,
      address: account.address,
    } as unknown as Viem.WalletClient
    vi.mocked(Viem.createWalletClient).mockReturnValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(Viem.createWalletClient).toHaveBeenCalledOnce()
    const args = vi.mocked(Viem.createWalletClient).mock.calls[0][0]
    expect(args.account).toMatchObject({ address: account.address })
    expect(args.account).toHaveProperty('nonceManager')
    expect(args.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})
