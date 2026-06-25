import type { PublicClient } from 'viem'
import { erc20Abi } from 'viem'
import { unichain } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createReceipt,
  RPC_URL,
  TOKEN_ADDRESS,
  TX_HASH,
  WALLET_ADDRESS,
} from '@/utils/anvil/__tests__/fixtures.js'
import { fundForkWallet } from '@/utils/anvil/index.js'

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
const OTHER_WHALE_ADDRESS = '0x2222222222222222222222222222222222222222'

describe('anvil funding helpers', () => {
  afterEach(() => {
    writeContractMock.mockReset()
    vi.restoreAllMocks()
  })

  it('funds ETH and ERC-20 balances through Anvil impersonation', async () => {
    const methods: string[] = []
    const publicClient = createReceiptClient()
    writeContractMock.mockResolvedValue(TX_HASH)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      methods.push(getJsonRpcMethod(init))
      return rpcSuccess(true)
    })

    await fundForkWallet({
      chain: unichain,
      ethAmountRaw: 2n,
      publicClient,
      rpcUrl: RPC_URL,
      targetAddress: WALLET_ADDRESS,
      tokens: [
        {
          amountRaw: 5n,
          token: TOKEN_ADDRESS,
          whale: WHALE_ADDRESS,
        },
      ],
      whaleEthAmountRaw: 3n,
    })

    expect(methods).toEqual([
      'anvil_setBalance',
      'anvil_setBalance',
      'anvil_impersonateAccount',
      'anvil_stopImpersonatingAccount',
    ])
    expect(writeContractMock).toHaveBeenCalledWith({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [WALLET_ADDRESS, 5n],
    })
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
    })
  })

  it('funds ETH without impersonating token whales', async () => {
    const methods: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      methods.push(getJsonRpcMethod(init))
      return rpcSuccess(true)
    })

    await fundForkWallet({
      chain: unichain,
      publicClient: createReceiptClient(),
      rpcUrl: RPC_URL,
      targetAddress: WALLET_ADDRESS,
    })

    expect(methods).toEqual(['anvil_setBalance'])
    expect(writeContractMock).not.toHaveBeenCalled()
  })

  it('serializes token funding that shares one whale', async () => {
    const methods: string[] = []
    const firstTransfer = createDeferredHash()
    const secondTransfer = createDeferredHash()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      methods.push(getJsonRpcMethod(init))
      return rpcSuccess(true)
    })
    writeContractMock
      .mockReturnValueOnce(firstTransfer.promise)
      .mockReturnValueOnce(secondTransfer.promise)

    const funding = fundForkWallet({
      chain: unichain,
      publicClient: createReceiptClient(),
      rpcUrl: RPC_URL,
      targetAddress: WALLET_ADDRESS,
      tokens: [
        { amountRaw: 5n, token: TOKEN_ADDRESS, whale: WHALE_ADDRESS },
        { amountRaw: 6n, token: TOKEN_ADDRESS, whale: WHALE_ADDRESS },
      ],
    })

    await vi.waitFor(() => expect(writeContractMock).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(writeContractMock).toHaveBeenCalledTimes(1)

    firstTransfer.resolve(TX_HASH)
    await vi.waitFor(() => expect(writeContractMock).toHaveBeenCalledTimes(2))
    secondTransfer.resolve(TX_HASH)
    await funding

    expect(methods).toEqual([
      'anvil_setBalance',
      'anvil_setBalance',
      'anvil_impersonateAccount',
      'anvil_stopImpersonatingAccount',
    ])
    expect(writeContractMock).toHaveBeenCalledTimes(2)
  })

  it('parallelizes token funding across different whales', async () => {
    const firstTransfer = createDeferredHash()
    const secondTransfer = createDeferredHash()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      rpcSuccess(true),
    )
    writeContractMock
      .mockReturnValueOnce(firstTransfer.promise)
      .mockReturnValueOnce(secondTransfer.promise)

    const funding = fundForkWallet({
      chain: unichain,
      publicClient: createReceiptClient(),
      rpcUrl: RPC_URL,
      targetAddress: WALLET_ADDRESS,
      tokens: [
        { amountRaw: 5n, token: TOKEN_ADDRESS, whale: WHALE_ADDRESS },
        { amountRaw: 6n, token: TOKEN_ADDRESS, whale: OTHER_WHALE_ADDRESS },
      ],
    })

    await vi.waitFor(() => expect(writeContractMock).toHaveBeenCalledTimes(2))
    firstTransfer.resolve(TX_HASH)
    secondTransfer.resolve(TX_HASH)
    await funding
  })
})

function createReceiptClient(): PublicClient {
  return {
    waitForTransactionReceipt: vi
      .fn()
      .mockResolvedValue(createReceipt('success', TX_HASH)),
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

function createDeferredHash(): {
  promise: Promise<typeof TX_HASH>
  resolve: (hash: typeof TX_HASH) => void
} {
  let resolve: ((hash: typeof TX_HASH) => void) | undefined
  const promise = new Promise<typeof TX_HASH>((resolvePromise) => {
    resolve = resolvePromise
  })
  return {
    promise,
    resolve: (hash) => {
      if (!resolve) throw new Error('Deferred promise is missing a resolver')
      resolve(hash)
    },
  }
}
