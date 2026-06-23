import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import { createAccount } from '@turnkey/viem'
import * as Viem from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockTurnkeyClient,
  createTurnkeyKeyRegistry,
} from '@/__mocks__/MockTurnkeyClient.js'
import {
  InvalidParamsError,
  SignerAddressMismatchError,
} from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/hosted/turnkey/TurnkeyWallet.js'

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof Viem>('viem')
  return {
    ...actual,
    createWalletClient: vi.fn(),
  }
})

vi.mock('@turnkey/viem', async () => ({
  createAccount: vi.fn(),
}))

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const client = createMockTurnkeyClient<TurnkeySDKClientBase>()
// Resolves signWith -> real signing key, reporting ethereumAddress when given.
const turnkeyKeys = createTurnkeyKeyRegistry()

function createTurnkeyWallet(params: {
  signWith: string
  ethereumAddress?: string
}) {
  return TurnkeyWallet.create({
    client,
    organizationId: 'org_123',
    signWith: params.signWith,
    ethereumAddress: params.ethereumAddress,
    chainManager: mockChainManager,
    actionProviders: {},
    actionSettings: {},
  })
}

describe('TurnkeyWallet (React)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createAccount).mockImplementation((params) =>
      Promise.resolve(
        turnkeyKeys.accountFor(
          (params as { signWith: string }).signWith,
          (params as { ethereumAddress?: Viem.Address }).ethereumAddress,
        ),
      ),
    )
  })

  it('should initialize signer and address from Turnkey account', async () => {
    const signWith = 'key_abc'
    const expectedAddress = turnkeyKeys.addressFor(signWith)

    const wallet = await createTurnkeyWallet({ signWith })

    expect(wallet.address).toBe(expectedAddress)
    expect(wallet.signer.address).toBe(expectedAddress)
    expect(createAccount).toHaveBeenCalledOnce()
    const args = vi.mocked(createAccount).mock.calls[0][0]
    expect(args.signWith).toBe(signWith)
    expect(args.ethereumAddress).toBeUndefined()
  })

  it('takes a matching ethereumAddress', async () => {
    const signWith = 'key_with_eth'
    const ethereumAddress = turnkeyKeys.addressFor(signWith)

    const wallet = await createTurnkeyWallet({ signWith, ethereumAddress })

    expect(wallet.address).toBe(ethereumAddress)
    expect(vi.mocked(createAccount).mock.calls[0][0].ethereumAddress).toBe(
      ethereumAddress,
    )
  })

  it('throws at construction when ethereumAddress is not controlled by signWith', async () => {
    const error = await createTurnkeyWallet({
      signWith: 'key_x',
      ethereumAddress: turnkeyKeys.addressFor('key_y'),
    }).catch((e: unknown) => e)

    expect((error as Error).cause).toBeInstanceOf(SignerAddressMismatchError)
  })

  it('throws at construction on a malformed ethereumAddress', async () => {
    const error = await createTurnkeyWallet({
      signWith: 'key_x',
      ethereumAddress: '0x123',
    }).catch((e: unknown) => e)

    expect((error as Error).cause).toBeInstanceOf(InvalidParamsError)
  })

  it('should create a wallet client with correct configuration', async () => {
    const signWith = 'key_client'
    const expectedAddress = turnkeyKeys.addressFor(signWith)
    const wallet = await createTurnkeyWallet({ signWith })

    const mockWalletClient = {
      account: wallet.signer,
      address: expectedAddress,
    } as unknown as Viem.WalletClient
    vi.mocked(Viem.createWalletClient).mockReturnValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(Viem.createWalletClient).toHaveBeenCalledOnce()
    const args = vi.mocked(Viem.createWalletClient).mock.calls[0][0]
    expect(args.account).toMatchObject({ address: expectedAddress })
    expect(args.account).toHaveProperty('nonceManager')
    expect(args.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})
