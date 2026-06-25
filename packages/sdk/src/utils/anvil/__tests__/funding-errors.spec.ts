import type { PublicClient } from 'viem'
import { unichain } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createReceipt,
  RPC_URL,
  TOKEN_ADDRESS,
  TX_HASH,
  WALLET_ADDRESS,
} from '@/utils/anvil/__tests__/fixtures.js'
import { ForkE2EConfigError, fundForkWallet } from '@/utils/anvil/index.js'

const writeContractMock = vi.hoisted(() => vi.fn())

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: writeContractMock,
    })),
  }
})

const WHALE_ADDRESS = '0x1111111111111111111111111111111111111111'

describe('anvil funding error paths', () => {
  afterEach(() => {
    writeContractMock.mockReset()
    vi.restoreAllMocks()
  })

  it('rejects invalid funding addresses before sending RPC requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(
      fundForkWallet({
        chain: unichain,
        publicClient: createReceiptClient(),
        rpcUrl: RPC_URL,
        targetAddress: '0x123',
      }),
    ).rejects.toThrow(ForkE2EConfigError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'token', token: '0x123', whale: WHALE_ADDRESS },
    { label: 'whale', token: TOKEN_ADDRESS, whale: '0x123' },
  ] as const)('rejects invalid $label addresses before RPC', async (token) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(
      fundForkWallet({
        chain: unichain,
        publicClient: createReceiptClient(),
        rpcUrl: RPC_URL,
        targetAddress: WALLET_ADDRESS,
        tokens: [{ amountRaw: 5n, token: token.token, whale: token.whale }],
      }),
    ).rejects.toThrow(ForkE2EConfigError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when an impersonated token transfer receipt reverts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      rpcSuccess(true),
    )
    writeContractMock.mockResolvedValue(TX_HASH)

    await expect(
      fundForkWallet({
        chain: unichain,
        publicClient: createReceiptClient('reverted'),
        rpcUrl: RPC_URL,
        targetAddress: WALLET_ADDRESS,
        tokens: [{ amountRaw: 5n, token: TOKEN_ADDRESS, whale: WHALE_ADDRESS }],
      }),
    ).rejects.toThrow('Fork e2e transaction did not succeed')
  })

  it('stops impersonating after a failed transfer', async () => {
    const methods: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      methods.push(getJsonRpcMethod(init))
      return rpcSuccess(true)
    })
    writeContractMock.mockRejectedValue(new Error('transfer failed'))

    await expect(
      fundForkWallet({
        chain: unichain,
        publicClient: createReceiptClient(),
        rpcUrl: RPC_URL,
        targetAddress: WALLET_ADDRESS,
        tokens: [{ amountRaw: 5n, token: TOKEN_ADDRESS, whale: WHALE_ADDRESS }],
      }),
    ).rejects.toThrow('transfer failed')
    expect(methods).toContain('anvil_stopImpersonatingAccount')
  })
})

function createReceiptClient(
  status: 'success' | 'reverted' = 'success',
): PublicClient {
  return {
    waitForTransactionReceipt: vi
      .fn()
      .mockResolvedValue(createReceipt(status, TX_HASH)),
  } as unknown as PublicClient
}

function rpcSuccess(result: unknown): Response {
  return new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result }))
}

function getJsonRpcMethod(init: RequestInit | undefined): string {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  if (isJsonRpcMethod(body)) return body.method
  throw new Error('Expected JSON-RPC method')
}

function isJsonRpcMethod(value: unknown): value is { method: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    typeof value.method === 'string'
  )
}
