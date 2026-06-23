import type { TurnkeyClient as TurnkeyHttpClient } from '@turnkey/http'
import { createAccount } from '@turnkey/viem'
import type { Address } from 'viem'
import { getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockTurnkeyClient,
  createTurnkeyKeyRegistry,
} from '@/__mocks__/MockTurnkeyClient.js'
import {
  InvalidParamsError,
  SignerAddressMismatchError,
} from '@/core/error/errors.js'
import { createSigner } from '@/wallet/node/wallets/hosted/turnkey/utils/createSigner.js'

vi.mock('@turnkey/viem', async () => ({
  createAccount: vi.fn(),
}))

describe('createSigner (Node Turnkey)', () => {
  const client = createMockTurnkeyClient<TurnkeyHttpClient>()
  // Resolves signWith -> real signing key, reporting ethereumAddress when given.
  const turnkeyKeys = createTurnkeyKeyRegistry()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createAccount).mockImplementation((params) =>
      Promise.resolve(
        turnkeyKeys.accountFor(
          (params as { signWith: string }).signWith,
          (params as { ethereumAddress?: Address }).ethereumAddress,
        ),
      ),
    )
  })

  it('reconciles and returns a signer when ethereumAddress matches the signWith key', async () => {
    const signWith = 'key_match'
    const expectedAddress = turnkeyKeys.addressFor(signWith)
    const ethereumAddress = expectedAddress.toLowerCase()

    const signer = await createSigner({
      client,
      organizationId: 'org_123',
      signWith,
      ethereumAddress,
    })

    expect(signer.address).toBe(expectedAddress)
    expect(signer.type).toBe('local')
    expect(createAccount).toHaveBeenCalledWith({
      client,
      organizationId: 'org_123',
      signWith,
      ethereumAddress: getAddress(ethereumAddress),
    })
  })

  it('reconciles when ethereumAddress is omitted (address fetched from Turnkey)', async () => {
    const signWith = 'key_fetch'

    const signer = await createSigner({
      client,
      organizationId: 'org_123',
      signWith,
    })

    expect(signer.address).toBe(turnkeyKeys.addressFor(signWith))
    expect(createAccount).toHaveBeenCalledWith({
      client,
      organizationId: 'org_123',
      signWith,
      ethereumAddress: undefined,
    })
  })

  it('throws when ethereumAddress is not controlled by the signWith key', async () => {
    const signWith = 'key_a'
    const wrongAddress = turnkeyKeys.addressFor('key_b')

    await expect(
      createSigner({
        client,
        organizationId: 'org_123',
        signWith,
        ethereumAddress: wrongAddress,
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError)
  })

  it('rejects a malformed ethereumAddress before calling Turnkey', async () => {
    await expect(
      createSigner({
        client,
        organizationId: 'org_123',
        signWith: 'key_a',
        ethereumAddress: '0xnotanaddress' as Address,
      }),
    ).rejects.toBeInstanceOf(InvalidParamsError)

    expect(createAccount).not.toHaveBeenCalled()
  })
})
