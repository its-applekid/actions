import { type ConnectedWallet, toViemAccount } from '@privy-io/react-auth'
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
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof Viem>('viem')
  return {
    ...actual,
    createWalletClient: vi.fn(),
  }
})

vi.mock('@privy-io/react-auth', () => ({
  toViemAccount: vi.fn(),
}))

type PrivyViemAccount = Awaited<ReturnType<typeof toViemAccount>>

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const connectedWallet = {
  __brand: 'privy-connected-wallet',
} as unknown as ConnectedWallet

function createWallet() {
  return PrivyWallet.create({
    connectedWallet,
    chainManager: mockChainManager,
    actionProviders: {},
    actionSettings: {},
  })
}

describe('PrivyWallet (React)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes and reconciles signer and address from Privy viem account', async () => {
    const vendorAccount = createSigningAccount()
    vi.mocked(toViemAccount).mockResolvedValue(
      vendorAccount as unknown as PrivyViemAccount,
    )

    const wallet = await createWallet()

    expect(wallet.address).toBe(vendorAccount.address)
    expect(wallet.signer.type).toBe('local')
    expect(toViemAccount).toHaveBeenCalledWith({ wallet: connectedWallet })
  })

  it('throws at construction when the vendor account address diverges from its key', async () => {
    vi.mocked(toViemAccount).mockResolvedValue(
      createDivergingAccount(getRandomAddress()) as unknown as PrivyViemAccount,
    )

    const error = await createWallet().catch((e: unknown) => e)

    expect((error as Error).cause).toBeInstanceOf(SignerAddressMismatchError)
  })

  it('creates a WalletClient with correct configuration', async () => {
    const vendorAccount = createSigningAccount()
    vi.mocked(toViemAccount).mockResolvedValue(
      vendorAccount as unknown as PrivyViemAccount,
    )
    const wallet = await createWallet()

    const mockWalletClient = {
      account: wallet.signer,
      address: vendorAccount.address,
    } as unknown as Viem.WalletClient
    vi.mocked(Viem.createWalletClient).mockReturnValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(Viem.createWalletClient).toHaveBeenCalledOnce()
    const args = vi.mocked(Viem.createWalletClient).mock.calls[0][0]
    expect(args.account).toMatchObject({ address: vendorAccount.address })
    expect(args.account).toHaveProperty('nonceManager')
    expect(args.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})
