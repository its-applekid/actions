import { type Address, decodeFunctionData } from 'viem'

import {
  assertAddressField,
  assertAmountField,
  assertBorrowAction,
  failCalldata,
} from '@/actions/borrow/core/calldataValidation.js'
import { isAaveApprovalCall } from '@/actions/borrow/providers/aave/decodeApproval.js'
import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'
import {
  requireAavePoolAddress,
  requireAaveWethGatewayAddress,
} from '@/actions/shared/aave/addresses.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type {
  AaveBorrowMarketConfig,
  BorrowQuote,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

const VARIABLE_RATE_MODE = 2n
const AAVE_OPERATIONS = [
  'borrow',
  'repay',
  'supply',
  'withdraw',
  'depositETH',
  'withdrawETH',
] as const

type AaveOperation = (typeof AAVE_OPERATIONS)[number]
type AaveTransactionKind = AaveOperation | 'approval'
type AaveSummary = Record<AaveOperation, number>

export function assertAaveQuoteExecution(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): void {
  const summary = emptySummary()
  for (const transaction of quote.execution.transactions) {
    const kind = classifyAaveTransaction(
      transaction,
      quote,
      market,
      walletAddress,
    )
    if (kind !== 'approval') summary[kind] += 1
  }
  assertAaveBundleShape(quote, market, summary)
}

function classifyAaveTransaction(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): AaveTransactionKind {
  const pool = classifyPoolCall(transaction, quote, market, walletAddress)
  if (pool) return pool
  const gateway = classifyGatewayCall(transaction, quote, market, walletAddress)
  if (gateway) return gateway
  if (isAaveApprovalCall(transaction, quote, market)) return 'approval'
  failCalldata('transaction', { received: transaction.to })
}

function classifyPoolCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): AaveOperation | undefined {
  try {
    const decoded = decodeFunctionData({
      abi: POOL_ABI,
      data: transaction.data,
    })
    assertTarget(transaction, requireAavePoolAddress(market.chainId))
    assertZeroValue(transaction)
    switch (decoded.functionName) {
      case 'borrow':
        assertPoolBorrow(quote, market, walletAddress, decoded.args)
        return 'borrow'
      case 'repay':
        assertPoolRepay(quote, market, walletAddress, decoded.args)
        return 'repay'
      case 'supply':
        assertPoolSupply(quote, market, walletAddress, decoded.args)
        return 'supply'
      case 'withdraw':
        assertPoolWithdraw(quote, market, walletAddress, decoded.args)
        return 'withdraw'
    }
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return undefined
  }
}

function classifyGatewayCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): AaveOperation | undefined {
  try {
    const decoded = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: transaction.data,
    })
    const pool = requireAavePoolAddress(market.chainId)
    assertTarget(transaction, requireAaveWethGatewayAddress(market.chainId))
    if (decoded.functionName === 'depositETH') {
      assertGatewayDeposit(
        quote,
        walletAddress,
        pool,
        transaction,
        decoded.args,
      )
      return 'depositETH'
    }
    if (decoded.functionName === 'withdrawETH') {
      assertGatewayWithdraw(
        quote,
        walletAddress,
        pool,
        transaction,
        decoded.args,
      )
      return 'withdrawETH'
    }
    return undefined
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return undefined
  }
}

function assertPoolBorrow(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [Address, bigint, bigint, number, Address],
): void {
  assertBorrowAction(quote.action, ['open'], 'borrow')
  assertReserve(args[0], market.aave.debtReserve)
  assertAmountField('borrow amount', args[1], quote.borrowAmountRaw)
  assertAmountField('rate mode', args[2], VARIABLE_RATE_MODE)
  assertAddressField('onBehalfOf', args[4], walletAddress)
}

function assertPoolRepay(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [Address, bigint, bigint, Address],
): void {
  assertBorrowAction(quote.action, ['repay', 'close'], 'repay')
  assertReserve(args[0], market.aave.debtReserve)
  assertAmountField('repay amount', args[1], quote.borrowAmountRaw, {
    allowMax: true,
  })
  assertAmountField('rate mode', args[2], VARIABLE_RATE_MODE)
  assertAddressField('onBehalfOf', args[3], walletAddress)
}

function assertPoolSupply(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [Address, bigint, Address, number],
): void {
  assertBorrowAction(quote.action, ['open', 'depositCollateral'], 'supply')
  assertReserve(args[0], market.aave.collateralReserve)
  assertAmountField('collateral amount', args[1], quote.collateralAmountRaw)
  assertAddressField('onBehalfOf', args[2], walletAddress)
}

function assertPoolWithdraw(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [Address, bigint, Address],
): void {
  assertBorrowAction(quote.action, ['withdrawCollateral', 'close'], 'withdraw')
  assertReserve(args[0], market.aave.collateralReserve)
  assertAmountField('collateral amount', args[1], quote.collateralAmountRaw, {
    allowMax: true,
  })
  assertAddressField('to', args[2], walletAddress)
}

function assertGatewayDeposit(
  quote: BorrowQuote,
  walletAddress: Address,
  pool: Address,
  transaction: TransactionData,
  args: readonly [Address, Address, number],
): void {
  assertBorrowAction(quote.action, ['open', 'depositCollateral'], 'depositETH')
  assertAddressField('pool', args[0], pool)
  assertAddressField('onBehalfOf', args[1], walletAddress)
  assertAmountField(
    'native value',
    transaction.value,
    quote.collateralAmountRaw,
  )
}

function assertGatewayWithdraw(
  quote: BorrowQuote,
  walletAddress: Address,
  pool: Address,
  transaction: TransactionData,
  args: readonly [Address, bigint, Address],
): void {
  assertBorrowAction(
    quote.action,
    ['withdrawCollateral', 'close'],
    'withdrawETH',
  )
  assertZeroValue(transaction)
  assertAddressField('pool', args[0], pool)
  assertAmountField('collateral amount', args[1], quote.collateralAmountRaw, {
    allowMax: true,
  })
  assertAddressField('to', args[2], walletAddress)
}

function assertAaveBundleShape(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  actual: AaveSummary,
): void {
  const expected = expectedAaveSummary(quote, market)
  for (const operation of AAVE_OPERATIONS) {
    assertCount(
      `transaction.${operation}`,
      actual[operation],
      expected[operation],
    )
  }
}

function expectedAaveSummary(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
): AaveSummary {
  const expected = emptySummary()
  const hasCollateral = (quote.collateralAmountRaw ?? 0n) > 0n
  if (quote.action === 'open') {
    expected.borrow = 1
    if (hasCollateral) expected[depositOperation(market)] = 1
  } else if (quote.action === 'depositCollateral') {
    expected[depositOperation(market)] = 1
  } else if (quote.action === 'withdrawCollateral') {
    expected[withdrawOperation(market)] = 1
  } else if (quote.action === 'repay') {
    expected.repay = 1
  } else {
    expected.repay = 1
    if (hasCollateral) expected[withdrawOperation(market)] = 1
  }
  return expected
}

function emptySummary(): AaveSummary {
  return {
    borrow: 0,
    repay: 0,
    supply: 0,
    withdraw: 0,
    depositETH: 0,
    withdrawETH: 0,
  }
}

function depositOperation(market: AaveBorrowMarketConfig): AaveOperation {
  return market.aave.collateralUsesWethGateway ? 'depositETH' : 'supply'
}

function withdrawOperation(market: AaveBorrowMarketConfig): AaveOperation {
  return market.aave.collateralUsesWethGateway ? 'withdrawETH' : 'withdraw'
}

function assertCount(field: string, actual: number, expected: number): void {
  if (actual === expected) return
  failCalldata(field, {
    expected: String(expected),
    received: String(actual),
  })
}

function assertTarget(transaction: TransactionData, expected: Address): void {
  assertAddressField('transaction.to', transaction.to, expected)
}

function assertZeroValue(transaction: TransactionData): void {
  assertAmountField('value', transaction.value, 0n)
}

function assertReserve(actual: Address, expected: Address): void {
  assertAddressField('reserve', actual, expected)
}
