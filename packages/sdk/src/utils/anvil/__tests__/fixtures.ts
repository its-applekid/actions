import type { Address, Hex, PublicClient } from 'viem'
import { unichain } from 'viem/chains'
import { vi } from 'vitest'

import { ETH } from '@/constants/assets.js'
import type { Asset } from '@/types/asset.js'
import type { SwapReceipt } from '@/types/swap/index.js'
import type {
  EOATransactionReceipt,
  UserOperationTransactionReceipt,
} from '@/wallet/core/wallets/abstract/types/index.js'

export const CHAIN_ID = unichain.id
export const RPC_URL = 'http://127.0.0.1:18545'
export const WALLET_ADDRESS =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
export const TOKEN_ADDRESS =
  '0x078D782b760474a361dDA0AF3839290b0EF57AD6' as const
export const TX_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const

const BLOCK_HASH =
  '0x2222222222222222222222222222222222222222222222222222222222222222' as const
const EMPTY_LOGS_BLOOM = `0x${'0'.repeat(512)}` as Hex

export const TEST_TOKEN = {
  address: { [CHAIN_ID]: TOKEN_ADDRESS },
  metadata: { decimals: 6, name: 'Test USDC', symbol: 'USDC' },
  type: 'erc20',
} satisfies Asset

export function createPublicClientMock(params: {
  ethBalances: bigint[]
  tokenBalances: bigint[]
}): PublicClient {
  return {
    getBalance: vi
      .fn()
      .mockImplementation(() => Promise.resolve(params.ethBalances.shift())),
    readContract: vi
      .fn()
      .mockImplementation(() => Promise.resolve(params.tokenBalances.shift())),
  } as unknown as PublicClient
}

export function createReceipt(
  status: 'success' | 'reverted',
  hash: Hex,
): EOATransactionReceipt {
  return {
    blockHash: BLOCK_HASH,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 1n,
    from: WALLET_ADDRESS,
    gasUsed: 21_000n,
    logs: [],
    logsBloom: EMPTY_LOGS_BLOOM,
    status,
    to: TOKEN_ADDRESS as Address,
    transactionHash: hash,
    transactionIndex: 0,
    type: 'legacy',
  }
}

export function createUserOperationReceipt(
  success: boolean,
  receiptStatus: 'success' | 'reverted',
): UserOperationTransactionReceipt {
  return {
    actualGasCost: 21_000n,
    actualGasUsed: 21_000n,
    entryPoint: TOKEN_ADDRESS,
    logs: [],
    nonce: 1n,
    receipt: createReceipt(receiptStatus, TX_HASH),
    sender: WALLET_ADDRESS,
    success,
    userOpHash: TX_HASH,
  }
}

export function createSwapReceipt(): SwapReceipt {
  return {
    amountIn: 2,
    amountInRaw: 2n,
    amountOut: 1,
    amountOutRaw: 1n,
    assetIn: TEST_TOKEN,
    assetOut: ETH,
    price: 0.5,
    priceImpact: 0,
    receipt: createReceipt('success', TX_HASH),
  }
}

export function createBorrowMarket() {
  return {
    borrowAsset: ETH,
    chainId: CHAIN_ID,
    collateralAsset: TEST_TOKEN,
    kind: 'morpho-blue' as const,
    marketId: TX_HASH,
    marketParams: {
      collateralToken: TOKEN_ADDRESS,
      irm: TOKEN_ADDRESS,
      lltv: 860000000000000000n,
      loanToken: TOKEN_ADDRESS,
      oracle: TOKEN_ADDRESS,
    },
    name: 'USDC / ETH',
  }
}

export function createBorrowReceipt() {
  return {
    action: 'open' as const,
    borrowAmount: 5n,
    collateralAmount: 10n,
    marketId: {
      chainId: CHAIN_ID,
      kind: 'morpho-blue' as const,
      marketId: TX_HASH,
    },
    receipt: createReceipt('success', TX_HASH),
  }
}
