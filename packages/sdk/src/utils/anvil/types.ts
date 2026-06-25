import type { Address, Chain, LocalAccount, PublicClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { NodeActionsConfig } from '@/nodeActionsFactory.js'
import type { Asset } from '@/types/asset.js'
import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowOpenPositionParams,
  BorrowReceipt,
  BorrowRepayParams,
  BorrowWithdrawCollateralParams,
} from '@/types/borrow/index.js'
import type {
  ClosePositionParams,
  LendOpenPositionParams,
  LendTransactionReceipt,
} from '@/types/lend/index.js'
import type { SwapReceipt, WalletSwapParams } from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import type { AnvilFork } from '@/utils/test.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'
import type { NodeProviderTypes } from '@/wallet/node/providers/hosted/types/index.js'

export type ForkActionsConfig<
  THostedWalletProviderType extends NodeProviderTypes = NodeProviderTypes,
> = Omit<NodeActionsConfig<THostedWalletProviderType>, 'chains'> & {
  chains?: NodeActionsConfig<THostedWalletProviderType>['chains']
}

export interface ForkActionsScenario<
  THostedWalletProviderType extends NodeProviderTypes = NodeProviderTypes,
> {
  actionsConfig: ForkActionsConfig<THostedWalletProviderType>
  account?: LocalAccount
  chain: Chain
  chainId: SupportedChainId
  privateKey?: `0x${string}`
  rpcUrl: string
}

interface ForkHarnessBaseConfig {
  chain: Chain
  chainId: SupportedChainId
}

export type ForkHarnessConfig = ForkAttachHarnessConfig | ForkStartHarnessConfig

export interface ForkAttachHarnessConfig extends ForkHarnessBaseConfig {
  mode: 'attach'
  rpcUrl: string
}

export interface ForkStartHarnessConfig extends ForkHarnessBaseConfig {
  forkUrl: string
  mode: 'start'
  port: number
}

export interface ForkHarness {
  chain: Chain
  chainId: SupportedChainId
  fork?: AnvilFork
  publicClient: PublicClient
  rpcUrl: string
  stop: () => void
}

export interface ForkTokenFunding {
  amountRaw: bigint
  token: `0x${string}`
  whale: `0x${string}`
}

export interface ForkWalletFunding {
  chain: Chain
  ethAmountRaw?: bigint
  publicClient: PublicClient
  rpcUrl: string
  targetAddress: `0x${string}`
  tokens?: readonly ForkTokenFunding[]
  whaleEthAmountRaw?: bigint
}

export interface ForkBalanceEntry {
  asset: Asset
  balanceRaw: bigint
}

export interface ForkBalanceSnapshot {
  address: Address
  balances: readonly ForkBalanceEntry[]
  chainId: SupportedChainId
}

export type ForkSnapshotAddresses = readonly [Address, ...Address[]]
export type ForkBalanceSnapshots = readonly [
  ForkBalanceSnapshot,
  ...ForkBalanceSnapshot[],
]

export interface ForkScenarioContext {
  chainId: SupportedChainId
  publicClient: PublicClient
  snapshotAddresses?: ForkSnapshotAddresses
}

export interface ForkScenarioRunResult<TResult> {
  after: ForkBalanceSnapshot
  afterSnapshots: ForkBalanceSnapshots
  before: ForkBalanceSnapshot
  beforeSnapshots: ForkBalanceSnapshots
  result: TResult
}

export interface ForkWalletSendTarget {
  address: `0x${string}`
  send: (
    transaction: TransactionData,
    chainId: SupportedChainId,
  ) => Promise<TransactionReturnType>
}

export interface ForkWalletBatchSendTarget {
  address: `0x${string}`
  sendBatch: (
    transactions: readonly TransactionData[],
    chainId: SupportedChainId,
  ) => Promise<BatchTransactionReturnType>
}

export interface ForkSwapTarget {
  address: `0x${string}`
  swap?: {
    execute: (params: WalletSwapParams) => Promise<SwapReceipt>
  }
}

export interface ForkLendTarget {
  address: `0x${string}`
  lend?: {
    closePosition: (
      params: ClosePositionParams,
    ) => Promise<LendTransactionReceipt>
    openPosition: (
      params: LendOpenPositionParams,
    ) => Promise<LendTransactionReceipt>
  }
}

export interface ForkBorrowTarget {
  address: `0x${string}`
  borrow?: {
    closePosition: (params: BorrowClosePositionParams) => Promise<BorrowReceipt>
    depositCollateral: (
      params: BorrowDepositCollateralParams,
    ) => Promise<BorrowReceipt>
    openPosition: (params: BorrowOpenPositionParams) => Promise<BorrowReceipt>
    repay: (params: BorrowRepayParams) => Promise<BorrowReceipt>
    withdrawCollateral: (
      params: BorrowWithdrawCollateralParams,
    ) => Promise<BorrowReceipt>
  }
}

export interface ForkWalletSendScenario extends ForkScenarioContext {
  balanceAssets?: readonly Asset[]
  transaction: TransactionData
}

export interface ForkWalletBatchSendScenario extends ForkScenarioContext {
  balanceAssets?: readonly Asset[]
  transactions: readonly TransactionData[]
}

export interface ForkSwapScenario extends ForkScenarioContext {
  balanceAssets?: readonly Asset[]
  swap: WalletSwapParams
}

export type ForkLendActionScenario =
  | { action?: 'open'; params: LendOpenPositionParams }
  | { action: 'close'; params: ClosePositionParams }

export interface ForkLendScenario extends ForkScenarioContext {
  balanceAssets?: readonly Asset[]
  lend: ForkLendActionScenario
}

export type ForkBorrowActionScenario =
  | { action: 'open'; params: BorrowOpenPositionParams }
  | { action: 'close'; params: BorrowClosePositionParams }
  | { action: 'depositCollateral'; params: BorrowDepositCollateralParams }
  | { action: 'withdrawCollateral'; params: BorrowWithdrawCollateralParams }
  | { action: 'repay'; params: BorrowRepayParams }

export interface ForkBorrowScenario extends ForkScenarioContext {
  balanceAssets?: readonly Asset[]
  borrow: ForkBorrowActionScenario
}
