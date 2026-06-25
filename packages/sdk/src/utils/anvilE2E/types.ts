import type { Chain, LocalAccount, PublicClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { NodeActionsConfig } from '@/nodeActionsFactory.js'
import type { Asset } from '@/types/asset.js'
import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowOpenPositionParams,
  BorrowRepayParams,
  BorrowWithdrawCollateralParams,
} from '@/types/borrow/index.js'
import type {
  ClosePositionParams,
  LendOpenPositionParams,
} from '@/types/lend/index.js'
import type { WalletSwapParams } from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import type { AnvilFork } from '@/utils/test.js'
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

export interface ForkHarnessConfig {
  chain: Chain
  chainId: SupportedChainId
  forkUrl?: string
  port?: number
  rpcUrl?: string
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
  address: `0x${string}`
  balances: readonly ForkBalanceEntry[]
  chainId: SupportedChainId
}

export interface ForkScenarioContext {
  chainId: SupportedChainId
  publicClient: PublicClient
}

export interface ForkScenarioRunResult<TResult> {
  after: ForkBalanceSnapshot
  before: ForkBalanceSnapshot
  result: TResult
}

export interface ForkWalletSendScenario extends ForkScenarioContext {
  balanceAssets?: readonly Asset[]
  transaction: TransactionData
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
