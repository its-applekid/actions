import { afterEach, describe, expect, it, vi } from 'vitest'

import { RPC_URL, WALLET_ADDRESS } from '@/utils/anvilE2E/__tests__/fixtures.js'
import { ForkE2EAnvilRpcError } from '@/utils/anvilE2E/index.js'
import { requestAnvilRpc } from '@/utils/anvilE2E/rpc.js'

interface JsonRpcRequest {
  method: string
  params: readonly unknown[]
}

describe('anvilE2E RPC helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts an Anvil JSON-RPC request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(rpcSuccess(true))

    await requestAnvilRpc(RPC_URL, 'anvil_setBalance', [WALLET_ADDRESS, '0x1'])

    const request = getJsonRpcRequest(fetchMock.mock.calls[0]?.[1])
    expect(request).toMatchObject({
      method: 'anvil_setBalance',
      params: [WALLET_ADDRESS, '0x1'],
    })
  })

  it('throws a named error when Anvil returns a JSON-RPC error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: -32000, message: 'impersonation failed' },
          id: 1,
          jsonrpc: '2.0',
        }),
      ),
    )

    await expect(
      requestAnvilRpc(RPC_URL, 'anvil_impersonateAccount', [WALLET_ADDRESS]),
    ).rejects.toThrow(ForkE2EAnvilRpcError)
  })

  it('wraps HTTP transport failures in a named error', async () => {
    const cause = new TypeError('connection refused')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(cause)

    await expect(
      requestAnvilRpc(RPC_URL, 'anvil_setBalance', [WALLET_ADDRESS, '0x1']),
    ).rejects.toMatchObject({
      cause,
      name: 'ForkE2EAnvilRpcError',
    })
  })

  it('wraps malformed JSON-RPC responses in a named error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json'))

    await expect(
      requestAnvilRpc(RPC_URL, 'anvil_setBalance', [WALLET_ADDRESS, '0x1']),
    ).rejects.toThrow(ForkE2EAnvilRpcError)
  })
})

function rpcSuccess(result: unknown): Response {
  return new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result }))
}

function getJsonRpcRequest(init: RequestInit | undefined) {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  if (!isJsonRpcRequest(body)) throw new Error('Expected JSON-RPC request')
  return body
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    'params' in value &&
    typeof value.method === 'string' &&
    Array.isArray(value.params)
  )
}
