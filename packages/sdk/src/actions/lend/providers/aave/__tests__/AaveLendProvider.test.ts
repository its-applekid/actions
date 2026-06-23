import { type Address, decodeFunctionData, erc20Abi } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MockReceiverAddress } from '@/actions/lend/__mocks__/MockMarkets.js'
import {
  createMockAaveReserve,
  createMockWETHReserve,
} from '@/actions/lend/providers/aave/__mocks__/mockReserve.js'
import { AaveLendProvider } from '@/actions/lend/providers/aave/AaveLendProvider.js'
import * as aaveSdk from '@/actions/lend/providers/aave/sdk.js'
import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'
import {
  getPoolAddress,
  getWETHGatewayAddress,
} from '@/actions/shared/aave/addresses.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset, LendMarketConfig } from '@/types/index.js'

// Mock the Aave SDK modules
vi.mock('@/actions/lend/providers/aave/sdk.js', () => ({
  getReserve: vi.fn(),
  getReserves: vi.fn(),
  getATokenAddress: vi.fn(),
}))

// Mock assets for Aave tests (using Base chain ID 8453)
const MockAaveUSDCAsset: Asset = {
  address: {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  metadata: {
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  type: 'erc20',
}

const MockAaveETHAsset: Asset = {
  address: {
    8453: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

// Mock market configurations for Aave
const MockAaveUSDCMarket: LendMarketConfig = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  chainId: 8453, // Base
  name: 'Aave USDC Base',
  asset: MockAaveUSDCAsset,
  lendProvider: 'aave',
}

const MockAaveETHMarket: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006', // WETH predeploy (market uses WETH internally)
  chainId: 8453,
  name: 'Aave ETH Base',
  asset: MockAaveETHAsset,
  lendProvider: 'aave',
}

describe('AaveLendProvider', () => {
  let provider: AaveLendProvider
  let mockConfig: LendProviderConfig
  let mockChainManager: ChainManager

  beforeEach(() => {
    mockConfig = {
      marketAllowlist: [MockAaveUSDCMarket, MockAaveETHMarket],
    }

    mockChainManager = new MockChainManager({
      supportedChains: [8453],
    }) as unknown as ChainManager

    provider = new AaveLendProvider(mockConfig, mockChainManager)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider).toBeInstanceOf(AaveLendProvider)
    })
  })

  describe('protocolSupportedChainIds', () => {
    it('should return all Aave V3 deployment chains', () => {
      const chainIds = provider.protocolSupportedChainIds()

      expect(chainIds).toHaveLength(6)
      expect(chainIds).toContain(10) // Optimism
      expect(chainIds).toContain(8453) // Base
      expect(chainIds).toContain(1868) // Soneium
      expect(chainIds).toContain(57073) // Ink
      expect(chainIds).toContain(11155420) // Optimism Sepolia
      expect(chainIds).toContain(84532) // Base Sepolia
    })
  })

  describe('supportedChainIds', () => {
    it('should return only chains present in ActionsConfig', () => {
      // mockChainManager is configured with supportedChains: [8453]
      const chainIds = provider.supportedChainIds()

      expect(chainIds).toEqual([8453])
    })

    it('should return unique chain IDs', () => {
      const chainIds = provider.supportedChainIds()
      expect(chainIds.length).toBe(new Set(chainIds).size)
    })
  })

  describe('openPosition', () => {
    beforeEach(() => {
      const mockReserve = createMockAaveReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockReserve)
    })

    it('should successfully create a lending transaction for ERC20', async () => {
      const amount = 1000
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
      }

      const lendTransaction = await provider.openPosition({
        amount,
        asset,
        marketId,
        walletAddress: MockReceiverAddress,
      })

      expect(lendTransaction).toHaveProperty('amount', BigInt('1000000000'))
      expect(lendTransaction).toHaveProperty(
        'assetAddress',
        asset.address[marketId.chainId],
      )
      expect(lendTransaction).toHaveProperty('marketId', marketId.address)
      expect(lendTransaction).toHaveProperty('apy')
      expect(lendTransaction).toHaveProperty('transactionData')
      expect(lendTransaction.transactionData).toHaveProperty('approval')
      expect(lendTransaction.transactionData).toHaveProperty('position')
      expect(typeof lendTransaction.apy).toBe('number')
      expect(lendTransaction.apy).toBeGreaterThan(0)
    })

    it('should create native ETH deposit without approval', async () => {
      const mockETHReserve = createMockWETHReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockETHReserve)

      const amount = 1
      const asset = MockAaveETHAsset
      const marketId = {
        address: MockAaveETHMarket.address,
        chainId: MockAaveETHMarket.chainId,
      }

      const lendTransaction = await provider.openPosition({
        amount,
        asset,
        marketId,
        walletAddress: MockReceiverAddress,
      })

      expect(lendTransaction).toHaveProperty(
        'amount',
        BigInt('1000000000000000000'),
      )
      expect(lendTransaction.transactionData).not.toHaveProperty('approval')
      expect(lendTransaction.transactionData).toHaveProperty('position')
      // Native ETH deposits send ETH as msg.value via WETHGateway
      expect(lendTransaction.transactionData.position.value).toBe(
        BigInt('1000000000000000000'),
      )
    })

    it('should handle lending errors', async () => {
      vi.mocked(aaveSdk.getReserve).mockRejectedValueOnce(
        new Error('Market fetch failed'),
      )

      const asset = MockAaveUSDCAsset
      const amount = 1000
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
      }

      await expect(
        provider.openPosition({
          amount,
          asset,
          marketId,
          walletAddress: MockReceiverAddress,
        }),
      ).rejects.toThrow('Failed to open position')
    })
  })

  describe('closePosition', () => {
    beforeEach(() => {
      const mockReserve = createMockAaveReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockReserve)
    })

    it('should successfully create a withdrawal transaction for ERC20', async () => {
      const amount = 500
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
      }
      const walletAddress = MockReceiverAddress

      const withdrawTransaction = await provider.closePosition({
        amount,
        asset,
        marketId,
        walletAddress,
      })

      expect(withdrawTransaction).toHaveProperty('amount', BigInt('500000000'))
      expect(withdrawTransaction).toHaveProperty(
        'assetAddress',
        asset.address[marketId.chainId],
      )
      expect(withdrawTransaction).toHaveProperty('marketId', marketId.address)
      expect(withdrawTransaction).toHaveProperty('apy')
      expect(withdrawTransaction).toHaveProperty('transactionData')
      expect(withdrawTransaction.transactionData).toHaveProperty('position')
      expect(withdrawTransaction.transactionData).not.toHaveProperty('approval')
      expect(typeof withdrawTransaction.apy).toBe('number')
      expect(withdrawTransaction.apy).toBeGreaterThan(0)
    })

    it('should create native ETH withdrawal with approval', async () => {
      const mockETHReserve = createMockWETHReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockETHReserve)
      vi.mocked(aaveSdk.getATokenAddress).mockResolvedValue(
        '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7',
      )

      const amount = 1
      const asset = MockAaveETHAsset
      const marketId = {
        address: MockAaveETHMarket.address,
        chainId: MockAaveETHMarket.chainId,
      }

      const withdrawTransaction = await provider.closePosition({
        amount,
        asset,
        marketId,
        walletAddress: MockReceiverAddress,
      })

      expect(withdrawTransaction).toHaveProperty(
        'amount',
        BigInt('1000000000000000000'),
      )
      // Native ETH withdrawals require approving aWETH to WETHGateway
      expect(withdrawTransaction.transactionData).toHaveProperty('approval')
      expect(withdrawTransaction.transactionData).toHaveProperty('position')
    })

    it('should handle withdrawal errors', async () => {
      vi.mocked(aaveSdk.getReserve).mockRejectedValueOnce(
        new Error('Market fetch failed'),
      )

      const amount = 500
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
      }
      const walletAddress = MockReceiverAddress

      await expect(
        provider.closePosition({
          amount,
          asset,
          marketId,
          walletAddress,
        }),
      ).rejects.toThrow('Market fetch failed')
    })
  })

  describe('market allowlist configuration', () => {
    it('should work without market allowlist', () => {
      const configWithoutAllowlist: LendProviderConfig = {}

      const providerWithoutAllowlist = new AaveLendProvider(
        configWithoutAllowlist,
        mockChainManager,
      )

      expect(providerWithoutAllowlist.config.marketAllowlist).toBeUndefined()
    })

    it('should store market allowlist when provided', () => {
      const configWithAllowlist: LendProviderConfig = {
        marketAllowlist: [MockAaveUSDCMarket],
      }

      const providerWithAllowlist = new AaveLendProvider(
        configWithAllowlist,
        mockChainManager,
      )

      const allowlist = providerWithAllowlist.config.marketAllowlist
      expect(allowlist).toBeDefined()
      expect(allowlist).toHaveLength(1)
      expect(allowlist![0].address).toBe(MockAaveUSDCMarket.address)
      expect(allowlist![0].name).toBe(MockAaveUSDCMarket.name)
    })

    it('should handle multiple markets in allowlist', () => {
      const configWithMultipleMarkets: LendProviderConfig = {
        marketAllowlist: [MockAaveUSDCMarket, MockAaveETHMarket],
      }

      const providerInstance = new AaveLendProvider(
        configWithMultipleMarkets,
        mockChainManager,
      )

      const allowlist = providerInstance.config.marketAllowlist
      expect(allowlist).toBeDefined()
      expect(allowlist).toHaveLength(2)
      expect(allowlist![0].name).toBe(MockAaveUSDCMarket.name)
      expect(allowlist![1].name).toBe(MockAaveETHMarket.name)
    })
  })

  describe('ETH/WETH market configuration', () => {
    it('should detect native asset type for ETH market', () => {
      // Market is configured with ETH (type: native) but uses WETH address internally
      expect(MockAaveETHMarket.asset.type).toBe('native')
      expect(MockAaveETHMarket.asset.address[8453]).toBe('native')
      // Market address points to WETH for Aave's internal operations
      expect(MockAaveETHMarket.address).toBe(
        '0x4200000000000000000000000000000000000006',
      )
    })

    it('should use WETHGateway for ETH deposits when asset type is native', async () => {
      const mockETHReserve = createMockWETHReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockETHReserve)

      const lendTransaction = await provider.openPosition({
        amount: 1,
        asset: MockAaveETHAsset,
        marketId: {
          address: MockAaveETHMarket.address,
          chainId: MockAaveETHMarket.chainId,
        },
        walletAddress: MockReceiverAddress,
      })

      // Native ETH deposits should have msg.value set (WETHGateway flow)
      expect(lendTransaction.transactionData.position.value).toBe(
        BigInt('1000000000000000000'),
      )
      // Should not require approval for native ETH
      expect(lendTransaction.transactionData.approval).toBeUndefined()
    })

    it('should allow developer to configure ETH market without knowing about WETH internals', () => {
      // Developer configures market with ETH asset
      // SDK handles WETH internally via WETHGateway
      const marketConfig: LendMarketConfig = {
        address: '0x4200000000000000000000000000000000000006', // WETH address
        chainId: 8453,
        name: 'Aave ETH',
        asset: MockAaveETHAsset, // Uses ETH (native) asset
        lendProvider: 'aave',
      }

      // Verify the market uses native asset
      expect(marketConfig.asset.type).toBe('native')
      // Developer doesn't need to create a separate WETH asset
    })
  })

  // Independent decode-back oracle (F190): the bytes the user actually signs are
  // decoded with the local Aave ABIs and every arg is asserted — especially the
  // recipient-in-bytes fields (`onBehalfOf`, `to`) and the approval `spender`,
  // which previously had zero coverage. These fail closed: routing aWETH or native
  // ETH to the pool/an attacker instead of the wallet flips an assertion.
  describe('signing-path calldata decode', () => {
    const CHAIN_ID = 8453
    const wallet = MockReceiverAddress.toLowerCase()
    const poolAddress = getPoolAddress(CHAIN_ID)!.toLowerCase()
    const gateway = getWETHGatewayAddress(CHAIN_ID)!.toLowerCase()

    beforeEach(() => {
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(createMockAaveReserve())
    })

    it('supply: decodes asset/amount/onBehalfOf/referralCode and the approval spender', async () => {
      const tx = await provider.openPosition({
        amount: 1000,
        asset: MockAaveUSDCAsset,
        marketId: { address: MockAaveUSDCMarket.address, chainId: CHAIN_ID },
        walletAddress: MockReceiverAddress,
      })

      expect(tx.transactionData.position.to.toLowerCase()).toBe(poolAddress)
      const supply = decodeFunctionData({
        abi: POOL_ABI,
        data: tx.transactionData.position.data,
      })
      expect(supply.functionName).toBe('supply')
      const [asset, amount, onBehalfOf, referralCode] =
        supply.args as readonly [Address, bigint, Address, number]
      expect(asset.toLowerCase()).toBe(
        MockAaveUSDCAsset.address[CHAIN_ID]!.toLowerCase(),
      )
      expect(amount).toBe(1000_000000n)
      expect(onBehalfOf.toLowerCase()).toBe(wallet)
      expect(referralCode).toBe(0)

      // Approval must grant the Pool (not an attacker) exactly the supply amount.
      const approval = tx.transactionData.approval!
      const approve = decodeFunctionData({ abi: erc20Abi, data: approval.data })
      expect(approve.functionName).toBe('approve')
      const [spender, allowance] = approve.args as readonly [Address, bigint]
      expect(spender.toLowerCase()).toBe(poolAddress)
      expect(allowance).toBe(1000_000000n)
    })

    it('withdraw: decodes asset/amount and routes `to` the wallet', async () => {
      const tx = await provider.closePosition({
        amount: 500,
        asset: MockAaveUSDCAsset,
        marketId: { address: MockAaveUSDCMarket.address, chainId: CHAIN_ID },
        walletAddress: MockReceiverAddress,
      })

      expect(tx.transactionData.position.to.toLowerCase()).toBe(poolAddress)
      const withdraw = decodeFunctionData({
        abi: POOL_ABI,
        data: tx.transactionData.position.data,
      })
      expect(withdraw.functionName).toBe('withdraw')
      const [asset, amount, to] = withdraw.args as readonly [
        Address,
        bigint,
        Address,
      ]
      expect(asset.toLowerCase()).toBe(
        MockAaveUSDCAsset.address[CHAIN_ID]!.toLowerCase(),
      )
      expect(amount).toBe(500_000000n)
      expect(to.toLowerCase()).toBe(wallet)
    })

    it('depositETH: decodes pool/onBehalfOf/referralCode and sends ETH as msg.value', async () => {
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(createMockWETHReserve())

      const tx = await provider.openPosition({
        amount: 1,
        asset: MockAaveETHAsset,
        marketId: { address: MockAaveETHMarket.address, chainId: CHAIN_ID },
        walletAddress: MockReceiverAddress,
      })

      expect(tx.transactionData.position.to.toLowerCase()).toBe(gateway)
      expect(tx.transactionData.position.value).toBe(10n ** 18n)
      const deposit = decodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        data: tx.transactionData.position.data,
      })
      expect(deposit.functionName).toBe('depositETH')
      const [pool, onBehalfOf, referralCode] = deposit.args as readonly [
        Address,
        Address,
        number,
      ]
      expect(pool.toLowerCase()).toBe(poolAddress)
      // onBehalfOf receives the aWETH — must be the wallet, never the pool.
      expect(onBehalfOf.toLowerCase()).toBe(wallet)
      expect(referralCode).toBe(0)
    })

    it('withdrawETH: decodes pool/amount, routes native ETH `to` the wallet, approves the gateway', async () => {
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(createMockWETHReserve())
      vi.mocked(aaveSdk.getATokenAddress).mockResolvedValue(
        '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7',
      )

      const tx = await provider.closePosition({
        amount: 1,
        asset: MockAaveETHAsset,
        marketId: { address: MockAaveETHMarket.address, chainId: CHAIN_ID },
        walletAddress: MockReceiverAddress,
      })

      expect(tx.transactionData.position.to.toLowerCase()).toBe(gateway)
      const withdraw = decodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        data: tx.transactionData.position.data,
      })
      expect(withdraw.functionName).toBe('withdrawETH')
      const [pool, amount, to] = withdraw.args as readonly [
        Address,
        bigint,
        Address,
      ]
      expect(pool.toLowerCase()).toBe(poolAddress)
      expect(amount).toBe(10n ** 18n)
      // `to` receives the unwrapped native ETH — the highest-blast-radius field.
      expect(to.toLowerCase()).toBe(wallet)

      // aWETH approval must be granted to the gateway, not the pool/an attacker.
      const approve = decodeFunctionData({
        abi: erc20Abi,
        data: tx.transactionData.approval!.data,
      })
      expect(approve.functionName).toBe('approve')
      const [spender] = approve.args as readonly [Address, bigint]
      expect(spender.toLowerCase()).toBe(gateway)
    })
  })

  describe('unsupported chain handling', () => {
    it('should throw error for unsupported chain', async () => {
      // Use type assertion to test runtime behavior with unsupported chain
      const unsupportedChainId = 999999 as 8453
      const unsupportedMarket: LendMarketConfig = {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        chainId: unsupportedChainId,
        name: 'Unsupported Market',
        asset: MockAaveUSDCAsset,
        lendProvider: 'aave',
      }

      const configWithUnsupported: LendProviderConfig = {
        marketAllowlist: [unsupportedMarket],
      }

      const providerWithUnsupported = new AaveLendProvider(
        configWithUnsupported,
        mockChainManager,
      )

      await expect(
        providerWithUnsupported.openPosition({
          amount: 100,
          asset: MockAaveUSDCAsset,
          marketId: {
            address: unsupportedMarket.address,
            chainId: unsupportedMarket.chainId,
          },
          walletAddress: MockReceiverAddress,
        }),
      ).rejects.toThrow('not supported')
    })
  })
})
