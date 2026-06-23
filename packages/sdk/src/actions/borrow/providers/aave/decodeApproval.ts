import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  isAddressEqual,
} from 'viem'

import {
  assertAddressField,
  assertAmountField,
  assertBorrowAction,
} from '@/actions/borrow/core/calldataValidation.js'
import {
  requireAavePoolAddress,
  requireAaveWethGatewayAddress,
} from '@/actions/shared/aave/addresses.js'
import { QuoteCalldataMismatchError } from '@/core/error/errors.js'
import type {
  AaveBorrowMarketConfig,
  BorrowAction,
  BorrowQuote,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export function isAaveApprovalCall(
  transaction: TransactionData,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    })
    if (decoded.functionName !== 'approve') return false
    assertAmountField('value', transaction.value, 0n)
    assertTrustedApproval(transaction.to, decoded.args[0], quote.action, market)
    return true
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return false
  }
}

function assertTrustedApproval(
  token: Address,
  spender: Address,
  action: BorrowAction,
  market: AaveBorrowMarketConfig,
): void {
  const pool = requireAavePoolAddress(market.chainId)
  const gateway = requireAaveWethGatewayAddress(market.chainId)
  if (isAddressEqual(spender, pool)) {
    assertPoolApprovalToken(token, action, market)
    return
  }
  assertAddressField('approval spender', spender, gateway)
  assertBorrowAction(action, ['withdrawCollateral', 'close'], 'approve')
}

function assertPoolApprovalToken(
  token: Address,
  action: BorrowAction,
  market: AaveBorrowMarketConfig,
): void {
  if (isAddressEqual(token, market.aave.collateralReserve)) {
    assertBorrowAction(action, ['open', 'depositCollateral'], 'approve')
    return
  }
  assertAddressField('approval token', token, market.aave.debtReserve)
  assertBorrowAction(action, ['repay', 'close'], 'approve')
}
