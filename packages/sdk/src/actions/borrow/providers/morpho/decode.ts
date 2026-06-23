import { blueAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, decodeFunctionData, erc20Abi } from 'viem'

import {
  assertAddressField,
  assertAmountField,
  assertBorrowAction,
  failCalldata,
} from '@/actions/borrow/core/calldataValidation.js'
import { requireMorphoBlueAddress } from '@/actions/borrow/providers/morpho/blue.js'
import { assertMorphoMarketParams } from '@/actions/borrow/providers/morpho/decodeMarketParams.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type {
  BorrowAction,
  BorrowQuote,
  MorphoBorrowMarketConfig,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export function assertMorphoQuoteExecution(
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
): void {
  for (const transaction of quote.execution.transactions) {
    assertMorphoTransaction(transaction, quote, market, walletAddress)
  }
}

function assertMorphoTransaction(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
): void {
  if (isMorphoCall(transaction, quote, market, walletAddress)) return
  if (isApprovalCall(transaction, quote.action, market)) return
  failCalldata('transaction', { received: transaction.to })
}

function isMorphoCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
): boolean {
  try {
    const decoded = decodeFunctionData({ abi: blueAbi, data: transaction.data })
    assertAddressField(
      'transaction.to',
      transaction.to,
      requireMorphoBlueAddress(market.chainId),
    )
    assertAmountField('value', transaction.value, 0n)
    switch (decoded.functionName) {
      case 'supplyCollateral':
        assertBorrowAction(
          quote.action,
          ['open', 'depositCollateral'],
          decoded.functionName,
        )
        assertMorphoMarketParams(decoded.args[0], market.marketParams)
        assertAmountField(
          'collateral amount',
          decoded.args[1],
          quote.collateralAmountRaw,
        )
        assertAddressField('onBehalf', decoded.args[2], walletAddress)
        return true
      case 'borrow':
        assertBorrowAction(quote.action, ['open'], decoded.functionName)
        assertMorphoMarketParams(decoded.args[0], market.marketParams)
        assertAmountField(
          'borrow amount',
          decoded.args[1],
          quote.borrowAmountRaw,
        )
        assertAddressField('onBehalf', decoded.args[3], walletAddress)
        assertAddressField('receiver', decoded.args[4], walletAddress)
        return true
      case 'repay':
        assertBorrowAction(
          quote.action,
          ['repay', 'close'],
          decoded.functionName,
        )
        assertMorphoMarketParams(decoded.args[0], market.marketParams)
        assertRepayAmount(
          decoded.args[1],
          decoded.args[2],
          quote.borrowAmountRaw,
        )
        assertAddressField('onBehalf', decoded.args[3], walletAddress)
        return true
      case 'withdrawCollateral':
        assertBorrowAction(
          quote.action,
          ['withdrawCollateral', 'close'],
          decoded.functionName,
        )
        assertMorphoMarketParams(decoded.args[0], market.marketParams)
        assertAmountField(
          'collateral amount',
          decoded.args[1],
          quote.collateralAmountRaw,
        )
        assertAddressField('onBehalf', decoded.args[2], walletAddress)
        assertAddressField('receiver', decoded.args[3], walletAddress)
        return true
      default:
        return false
    }
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return false
  }
}

function isApprovalCall(
  transaction: TransactionData,
  action: BorrowAction,
  market: MorphoBorrowMarketConfig,
): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    })
    if (decoded.functionName !== 'approve') return false
    assertAmountField('value', transaction.value, 0n)
    assertAddressField(
      'approval spender',
      decoded.args[0],
      requireMorphoBlueAddress(market.chainId),
    )
    assertApprovalToken(transaction.to, action, market)
    return true
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return false
  }
}

function assertApprovalToken(
  token: Address,
  action: BorrowAction,
  market: MorphoBorrowMarketConfig,
): void {
  if (
    token.toLowerCase() === market.marketParams.collateralToken.toLowerCase()
  ) {
    assertBorrowAction(action, ['open', 'depositCollateral'], 'approve')
    return
  }
  assertAddressField('approval token', token, market.marketParams.loanToken)
  assertBorrowAction(action, ['repay', 'close'], 'approve')
}

function assertRepayAmount(
  assets: bigint,
  shares: bigint,
  expectedAssets: bigint | undefined,
): void {
  if (assets === 0n && shares > 0n) return
  assertAmountField('repay amount', assets, expectedAssets)
}
