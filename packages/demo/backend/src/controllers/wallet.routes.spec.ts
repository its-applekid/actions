import { SignerAddressMismatchError } from '@eth-optimism/actions-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as walletService from '@/services/wallet.js'

vi.mock('@/services/borrow.js', () => ({
  getMarkets: vi.fn(),
  getQuote: vi.fn(),
  openPosition: vi.fn(),
  closePosition: vi.fn(),
  depositCollateral: vi.fn(),
  withdrawCollateral: vi.fn(),
  repay: vi.fn(),
  resolveMarketConfig: vi.fn(),
}))

vi.mock('@/services/wallet.js', () => ({
  getWallet: vi.fn(),
  getBorrowPosition: vi.fn(),
  getLendPosition: vi.fn(),
  getWalletBalance: vi.fn(),
  mintDemoUsdcToWallet: vi.fn(),
}))

vi.mock('@/services/faucet.js', () => ({
  isWalletEligibleForFaucet: vi.fn(),
  dripEthToWallet: vi.fn(),
}))

vi.mock('@/services/assets.js', () => ({
  getAssets: vi.fn(),
}))

vi.mock('@/services/swap.js', () => ({
  getMarkets: vi.fn(),
  getQuote: vi.fn(),
  executeSwap: vi.fn(),
}))

vi.mock('@/services/lend.js', () => ({
  getMarkets: vi.fn(),
  openPosition: vi.fn(),
  closePosition: vi.fn(),
}))

vi.mock('@/config/actions.js', () => ({
  initializeActions: vi.fn(),
  getActions: vi.fn(() => ({})),
  getPrivyClient: vi.fn(),
}))

vi.mock('@/middleware/actions.js', () => ({
  actionsMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

const REPORTED_ADDRESS = '0x0000000000000000000000000000000000000001'
const RECOVERED_ADDRESS = '0x0000000000000000000000000000000000000002'

function authHeaders() {
  return {
    Authorization: 'Bearer fake-access-token',
    'privy-id-token': 'fake-id-token',
  }
}

beforeEach(async () => {
  vi.resetAllMocks()
  const { getPrivyClient } = await import('@/config/actions.js')
  vi.mocked(getPrivyClient).mockReturnValue({
    utils: () => ({
      auth: () => ({ verifyAuthToken: vi.fn().mockResolvedValue(undefined) }),
    }),
  } as never)
})

describe('wallet routes', () => {
  describe('GET /wallet', () => {
    it('maps signer address mismatches to the SDK error response', async () => {
      vi.mocked(walletService.getWallet).mockRejectedValue(
        new SignerAddressMismatchError({
          reportedAddress: REPORTED_ADDRESS,
          recoveredAddress: RECOVERED_ADDRESS,
        }),
      )

      const res = await createApp().request('/wallet', {
        headers: authHeaders(),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe(
        'Wallet signer does not match its reported address.',
      )
      expect(json.error).not.toContain(REPORTED_ADDRESS)
      expect(json.error).not.toContain(RECOVERED_ADDRESS)
    })
  })
})
