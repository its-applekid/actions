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

export function assertAaveQuoteExecution(
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): void {
  for (const transaction of quote.execution.transactions) {
    assertAaveTransaction(transaction, quote, market, walletAddress)
  }
}

function assertAaveTransaction(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): void {
  if (isPoolCall(transaction, quote, market, walletAddress)) return
  if (isGatewayCall(transaction, quote, market, walletAddress)) return
  if (isAaveApprovalCall(transaction, quote, market)) return
  failCalldata('transaction', { received: transaction.to })
}

function isPoolCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: POOL_ABI,
      data: transaction.data,
    })
    assertTarget(transaction, requireAavePoolAddress(market.chainId))
    assertZeroValue(transaction)
    switch (decoded.functionName) {
      case 'borrow':
        assertBorrowAction(quote.action, ['open'], decoded.functionName)
        assertReserve(decoded.args[0], market.aave.debtReserve)
        assertAmountField(
          'borrow amount',
          decoded.args[1],
          quote.borrowAmountRaw,
        )
        assertAmountField('rate mode', decoded.args[2], VARIABLE_RATE_MODE)
        assertAddressField('onBehalfOf', decoded.args[4], walletAddress)
        return true
      case 'repay':
        assertBorrowAction(
          quote.action,
          ['repay', 'close'],
          decoded.functionName,
        )
        assertReserve(decoded.args[0], market.aave.debtReserve)
        assertAmountField(
          'repay amount',
          decoded.args[1],
          quote.borrowAmountRaw,
          {
            allowMax: true,
          },
        )
        assertAmountField('rate mode', decoded.args[2], VARIABLE_RATE_MODE)
        assertAddressField('onBehalfOf', decoded.args[3], walletAddress)
        return true
      case 'supply':
        assertBorrowAction(
          quote.action,
          ['open', 'depositCollateral'],
          decoded.functionName,
        )
        assertReserve(decoded.args[0], market.aave.collateralReserve)
        assertAmountField(
          'collateral amount',
          decoded.args[1],
          quote.collateralAmountRaw,
        )
        assertAddressField('onBehalfOf', decoded.args[2], walletAddress)
        return true
      case 'withdraw':
        assertBorrowAction(
          quote.action,
          ['withdrawCollateral', 'close'],
          decoded.functionName,
        )
        assertReserve(decoded.args[0], market.aave.collateralReserve)
        assertAmountField(
          'collateral amount',
          decoded.args[1],
          quote.collateralAmountRaw,
          { allowMax: true },
        )
        assertAddressField('to', decoded.args[2], walletAddress)
        return true
    }
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return false
  }
}

function isGatewayCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
  walletAddress: Address,
): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: transaction.data,
    })
    const pool = requireAavePoolAddress(market.chainId)
    assertTarget(transaction, requireAaveWethGatewayAddress(market.chainId))
    if (decoded.functionName === 'depositETH') {
      assertBorrowAction(
        quote.action,
        ['open', 'depositCollateral'],
        decoded.functionName,
      )
      assertAddressField('pool', decoded.args[0], pool)
      assertAddressField('onBehalfOf', decoded.args[1], walletAddress)
      assertAmountField(
        'native value',
        transaction.value,
        quote.collateralAmountRaw,
      )
      return true
    }
    assertBorrowAction(
      quote.action,
      ['withdrawCollateral', 'close'],
      decoded.functionName,
    )
    assertZeroValue(transaction)
    assertAddressField('pool', decoded.args[0], pool)
    assertAmountField(
      'collateral amount',
      decoded.args[1],
      quote.collateralAmountRaw,
      { allowMax: true },
    )
    assertAddressField('to', decoded.args[2], walletAddress)
    return true
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return false
  }
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
