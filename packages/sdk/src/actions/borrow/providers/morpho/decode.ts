import { blueAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, decodeFunctionData, erc20Abi } from 'viem'

import {
  assertAddressField,
  assertAmountField,
  assertBorrowAction,
  assertCountField,
  emptyOperationSummary,
  failCalldata,
  quoteHasCollateral,
} from '@/actions/borrow/core/calldataValidation.js'
import { requireMorphoBlueAddress } from '@/actions/borrow/providers/morpho/blue.js'
import { assertMorphoMarketParams } from '@/actions/borrow/providers/morpho/decodeMarketParams.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type {
  BorrowAction,
  BorrowQuote,
  MorphoBorrowMarketConfig,
  MorphoMarketParams,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

const MORPHO_OPERATIONS = [
  'supplyCollateral',
  'borrow',
  'repay',
  'withdrawCollateral',
] as const

type MorphoOperation = (typeof MORPHO_OPERATIONS)[number]
type MorphoTransactionKind = MorphoOperation | 'approval'
type MorphoSummary = Record<MorphoOperation, number>

export function assertMorphoQuoteExecution(
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
): void {
  const summary = emptyOperationSummary(MORPHO_OPERATIONS)
  for (const transaction of quote.execution.transactions) {
    const kind = classifyMorphoTransaction(
      transaction,
      quote,
      market,
      walletAddress,
    )
    if (kind !== 'approval') summary[kind] += 1
  }
  assertMorphoBundleShape(quote, summary)
}

function classifyMorphoTransaction(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
): MorphoTransactionKind {
  const morpho = classifyMorphoCall(transaction, quote, market, walletAddress)
  if (morpho) return morpho
  if (isApprovalCall(transaction, quote.action, market)) return 'approval'
  failCalldata('transaction', { received: transaction.to })
}

function classifyMorphoCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
): MorphoOperation | undefined {
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
        assertSupplyCollateral(quote, market, walletAddress, decoded.args)
        return 'supplyCollateral'
      case 'borrow':
        assertBorrow(quote, market, walletAddress, decoded.args)
        return 'borrow'
      case 'repay':
        assertRepay(quote, market, walletAddress, decoded.args)
        return 'repay'
      case 'withdrawCollateral':
        assertWithdrawCollateral(quote, market, walletAddress, decoded.args)
        return 'withdrawCollateral'
      default:
        return undefined
    }
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return undefined
  }
}

function assertSupplyCollateral(
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [MorphoMarketParams, bigint, Address, `0x${string}`],
): void {
  assertBorrowAction(
    quote.action,
    ['open', 'depositCollateral'],
    'supplyCollateral',
  )
  assertMorphoMarketParams(args[0], market.marketParams)
  assertAmountField('collateral amount', args[1], quote.collateralAmountRaw)
  assertAddressField('onBehalf', args[2], walletAddress)
}

function assertBorrow(
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [MorphoMarketParams, bigint, bigint, Address, Address],
): void {
  assertBorrowAction(quote.action, ['open'], 'borrow')
  assertMorphoMarketParams(args[0], market.marketParams)
  assertAmountField('borrow amount', args[1], quote.borrowAmountRaw)
  assertAmountField('borrow shares', args[2], 0n)
  assertAddressField('onBehalf', args[3], walletAddress)
  assertAddressField('receiver', args[4], walletAddress)
}

function assertRepay(
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [MorphoMarketParams, bigint, bigint, Address, `0x${string}`],
): void {
  assertBorrowAction(quote.action, ['repay', 'close'], 'repay')
  assertMorphoMarketParams(args[0], market.marketParams)
  assertRepayAmount(args[1], args[2], quote)
  assertAddressField('onBehalf', args[3], walletAddress)
}

function assertWithdrawCollateral(
  quote: BorrowQuote,
  market: MorphoBorrowMarketConfig,
  walletAddress: Address,
  args: readonly [MorphoMarketParams, bigint, Address, Address],
): void {
  assertBorrowAction(
    quote.action,
    ['withdrawCollateral', 'close'],
    'withdrawCollateral',
  )
  assertMorphoMarketParams(args[0], market.marketParams)
  assertAmountField('collateral amount', args[1], quote.collateralAmountRaw)
  assertAddressField('onBehalf', args[2], walletAddress)
  assertAddressField('receiver', args[3], walletAddress)
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
  quote: BorrowQuote,
): void {
  if (shares === 0n) {
    assertAmountField('repay amount', assets, quote.borrowAmountRaw)
    return
  }
  assertAmountField('repay amount', assets, 0n)
  assertAmountField('repay shares', shares, expectedRepayShares(quote))
}

function expectedRepayShares(quote: BorrowQuote): bigint | undefined {
  const value = quote.execution.providerContext?.repaySharesRaw
  return typeof value === 'bigint' ? value : undefined
}

function assertMorphoBundleShape(
  quote: BorrowQuote,
  actual: MorphoSummary,
): void {
  const expected = expectedMorphoSummary(quote)
  for (const operation of MORPHO_OPERATIONS) {
    assertCountField(
      `transaction.${operation}`,
      actual[operation],
      expected[operation],
    )
  }
}

function expectedMorphoSummary(quote: BorrowQuote): MorphoSummary {
  const expected = emptyOperationSummary(MORPHO_OPERATIONS)
  if (quote.action === 'open') {
    expected.borrow = 1
    if (quoteHasCollateral(quote)) expected.supplyCollateral = 1
  } else if (quote.action === 'depositCollateral') {
    expected.supplyCollateral = 1
  } else if (quote.action === 'withdrawCollateral') {
    expected.withdrawCollateral = 1
  } else if (quote.action === 'repay') {
    expected.repay = 1
  } else {
    expected.repay = 1
    if (quoteHasCollateral(quote)) expected.withdrawCollateral = 1
  }
  return expected
}
