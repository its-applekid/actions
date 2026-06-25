import type { Asset } from '@/types/asset.js'
import type { BorrowReceipt } from '@/types/borrow/index.js'
import type { LendTransactionReceipt } from '@/types/lend/index.js'
import type { SwapReceipt } from '@/types/swap/index.js'
import { snapshotTokenBalances } from '@/utils/anvil/balances.js'
import { ForkE2EConfigError } from '@/utils/anvil/errors.js'
import { assertSuccessfulReceipts } from '@/utils/anvil/receipts.js'
import type {
  ForkBorrowActionScenario,
  ForkBorrowScenario,
  ForkBorrowTarget,
  ForkLendActionScenario,
  ForkLendScenario,
  ForkLendTarget,
  ForkScenarioContext,
  ForkScenarioRunResult,
  ForkSwapScenario,
  ForkSwapTarget,
  ForkWalletBatchSendScenario,
  ForkWalletBatchSendTarget,
  ForkWalletSendScenario,
  ForkWalletSendTarget,
} from '@/utils/anvil/types.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Run a standard wallet send e2e scenario.
 * @description Sends one transaction through the public wallet API, asserts
 * the mined receipt succeeded, and snapshots selected balances around it.
 * @param wallet - SDK wallet created from `setupForkActions`.
 * @param scenario - Wallet send scenario.
 * @returns Before snapshot, wallet receipt, and after snapshot.
 * @throws ForkE2EReceiptError when the wallet receipt is not successful.
 */
export async function runForkWalletSendE2E(
  wallet: ForkWalletSendTarget,
  scenario: ForkWalletSendScenario,
): Promise<ForkScenarioRunResult<TransactionReturnType>> {
  return runWithSnapshots(
    wallet,
    scenario,
    scenario.balanceAssets ?? [],
    async () =>
      assertSuccessfulReceipts(
        await wallet.send(scenario.transaction, scenario.chainId),
      ),
  )
}

/**
 * Run a standard wallet batch-send e2e scenario.
 * @description Sends a transaction list through the public wallet batch API,
 * asserts all mined receipts succeeded, and snapshots selected balances.
 * @param wallet - SDK wallet created from `setupForkActions`.
 * @param scenario - Wallet batch-send scenario.
 * @returns Before snapshot, wallet batch receipt, and after snapshot.
 * @throws ForkE2EReceiptError when any wallet receipt is not successful.
 */
export async function runForkWalletBatchSendE2E(
  wallet: ForkWalletBatchSendTarget,
  scenario: ForkWalletBatchSendScenario,
): Promise<ForkScenarioRunResult<BatchTransactionReturnType>> {
  return runWithSnapshots(
    wallet,
    scenario,
    scenario.balanceAssets ?? [],
    async () =>
      assertSuccessfulReceipts(
        await wallet.sendBatch(scenario.transactions, scenario.chainId),
      ),
  )
}

/**
 * Run a standard swap provider e2e scenario.
 * @description Executes `wallet.swap.execute` through the public SDK surface,
 * asserts receipts, and snapshots input/output token balances.
 * @param wallet - SDK wallet created from `setupForkActions`.
 * @param scenario - Swap scenario and optional balance override.
 * @returns Before snapshot, swap receipt, and after snapshot.
 * @throws ForkE2EConfigError when the wallet has no swap namespace.
 */
export async function runForkSwapProviderE2E(
  wallet: ForkSwapTarget,
  scenario: ForkSwapScenario,
): Promise<ForkScenarioRunResult<SwapReceipt>> {
  return runWithSnapshots(wallet, scenario, swapAssets(scenario), async () => {
    const result = await requireNamespace(wallet.swap, 'swap').execute(
      scenario.swap,
    )
    assertSuccessfulReceipts(result.receipt)
    return result
  })
}

/**
 * Run a standard lend provider e2e scenario.
 * @description Executes a lend open or close through `wallet.lend`, asserts
 * receipts, and snapshots configured balances.
 * @param wallet - SDK wallet created from `setupForkActions`.
 * @param scenario - Lend scenario and optional balance override.
 * @returns Before snapshot, lend receipt, and after snapshot.
 * @throws ForkE2EConfigError when the wallet has no lend namespace.
 */
export async function runForkLendProviderE2E(
  wallet: ForkLendTarget,
  scenario: ForkLendScenario,
): Promise<ForkScenarioRunResult<LendTransactionReceipt>> {
  return runWithSnapshots(wallet, scenario, lendAssets(scenario), async () =>
    assertSuccessfulReceipts(await executeLendScenario(wallet, scenario.lend)),
  )
}

/**
 * Run a standard borrow provider e2e scenario.
 * @description Executes a borrow action through `wallet.borrow`, asserts
 * receipts, and snapshots collateral/borrow token balances by default.
 * @param wallet - SDK wallet created from `setupForkActions`.
 * @param scenario - Borrow scenario and optional balance override.
 * @returns Before snapshot, borrow receipt, and after snapshot.
 * @throws ForkE2EConfigError when the wallet has no borrow namespace.
 */
export async function runForkBorrowProviderE2E(
  wallet: ForkBorrowTarget,
  scenario: ForkBorrowScenario,
): Promise<ForkScenarioRunResult<BorrowReceipt>> {
  return runWithSnapshots(
    wallet,
    scenario,
    borrowAssets(scenario),
    async () => {
      const result = await executeBorrowScenario(wallet, scenario.borrow)
      assertSuccessfulReceipts(result.receipt)
      return result
    },
  )
}

async function runWithSnapshots<TResult>(
  wallet: { address: `0x${string}` },
  context: ForkScenarioContext,
  assets: readonly Asset[],
  action: () => Promise<TResult>,
): Promise<ForkScenarioRunResult<TResult>> {
  const before = await snapshotTokenBalances(context, wallet.address, assets)
  const result = await action()
  const after = await snapshotTokenBalances(context, wallet.address, assets)
  return { after, before, result }
}

function swapAssets(scenario: ForkSwapScenario): readonly Asset[] {
  return (
    scenario.balanceAssets ?? [scenario.swap.assetIn, scenario.swap.assetOut]
  )
}

function lendAssets(scenario: ForkLendScenario): readonly Asset[] {
  if (scenario.balanceAssets) return scenario.balanceAssets
  if (scenario.lend.action === 'close') {
    return scenario.lend.params.asset ? [scenario.lend.params.asset] : []
  }
  return [scenario.lend.params.asset]
}

function borrowAssets(scenario: ForkBorrowScenario): readonly Asset[] {
  return (
    scenario.balanceAssets ?? [
      scenario.borrow.params.market.collateralAsset,
      scenario.borrow.params.market.borrowAsset,
    ]
  )
}

function executeLendScenario(
  wallet: ForkLendTarget,
  scenario: ForkLendActionScenario,
): Promise<LendTransactionReceipt> {
  const lend = requireNamespace(wallet.lend, 'lend')
  if (scenario.action === 'close') return lend.closePosition(scenario.params)
  return lend.openPosition(scenario.params)
}

function executeBorrowScenario(
  wallet: ForkBorrowTarget,
  scenario: ForkBorrowActionScenario,
): Promise<BorrowReceipt> {
  const borrow = requireNamespace(wallet.borrow, 'borrow')
  if (scenario.action === 'open') return borrow.openPosition(scenario.params)
  if (scenario.action === 'close') return borrow.closePosition(scenario.params)
  if (scenario.action === 'repay') return borrow.repay(scenario.params)
  if (scenario.action === 'depositCollateral') {
    return borrow.depositCollateral(scenario.params)
  }
  return borrow.withdrawCollateral(scenario.params)
}

function requireNamespace<TNamespace>(
  namespace: TNamespace | undefined,
  name: string,
): TNamespace {
  if (!namespace) {
    throw new ForkE2EConfigError(`Wallet is missing ${name} namespace.`)
  }
  return namespace
}
