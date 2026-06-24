import * as PrivyNodeViem from '@privy-io/node/viem'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createPrivyKeyRegistry,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import {
  InvalidParamsError,
  SignerAddressMismatchError,
} from '@/core/error/errors.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

vi.mock('@privy-io/node/viem', async () => {
  const actual = await vi.importActual<typeof PrivyNodeViem>(
    '@privy-io/node/viem',
  )
  return {
    ...actual,
    createViemAccount: vi.fn(),
  }
})

describe('createSigner (Node Privy)', () => {
  const mockPrivyClient = createMockPrivyClient(
    'test-app-id',
    'test-app-secret',
  )
  const authorizationContext = getMockAuthorizationContext()
  // Resolves walletId -> real signing key, while reporting the caller's address.
  const privyKeys = createPrivyKeyRegistry()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(PrivyNodeViem.createViemAccount).mockImplementation(
      (_client, params) =>
        privyKeys.accountFor(
          (params as { walletId: string }).walletId,
          (params as { address: Address }).address,
        ),
    )
  })

  it('reconciles and returns a signer when the address matches the walletId key', async () => {
    const walletId = 'wallet-matched'
    const address = privyKeys.addressFor(walletId)

    const signer = await createSigner({
      privyClient: mockPrivyClient,
      authorizationContext,
      walletId,
      address,
    })

    expect(signer.address).toBe(address)
    expect(signer.type).toBe('local')
  })

  it('normalizes the reported address through getAddress before signing', async () => {
    const walletId = 'wallet-checksum'
    const checksummed = privyKeys.addressFor(walletId)

    const signer = await createSigner({
      privyClient: mockPrivyClient,
      authorizationContext,
      walletId,
      address: `0x${checksummed.slice(2).toLowerCase()}`,
    })

    expect(PrivyNodeViem.createViemAccount).toHaveBeenCalledWith(
      mockPrivyClient,
      expect.objectContaining({ walletId, address: checksummed }),
    )
    expect(signer.address).toBe(checksummed)
  })

  it('throws when the (walletId, address) pair points at the wrong wallet', async () => {
    const walletId = 'wallet-a'
    // The address of a *different* wallet, a classic copy-paste mismatch.
    const wrongAddress = privyKeys.addressFor('wallet-b')

    await expect(
      createSigner({
        privyClient: mockPrivyClient,
        authorizationContext,
        walletId,
        address: wrongAddress,
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })

  it('throws on a malformed reported address', async () => {
    await expect(
      createSigner({
        privyClient: mockPrivyClient,
        authorizationContext,
        walletId: 'wallet-a',
        address: '0x123',
      }),
    ).rejects.toBeInstanceOf(InvalidParamsError)

    expect(PrivyNodeViem.createViemAccount).not.toHaveBeenCalled()
  })
})
