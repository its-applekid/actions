import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  isAddress,
  isAddressEqual,
} from 'viem'

import {
  assertAddressField,
  assertAmountField,
  assertBorrowAction,
  failCalldata,
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
    assertTrustedApproval(transaction.to, decoded.args[0], quote, market)
    return true
  } catch (error) {
    if (error instanceof QuoteCalldataMismatchError) throw error
    return false
  }
}

function assertTrustedApproval(
  token: Address,
  spender: Address,
  quote: BorrowQuote,
  market: AaveBorrowMarketConfig,
): void {
  const pool = requireAavePoolAddress(market.chainId)
  const gateway = requireAaveWethGatewayAddress(market.chainId)
  if (isAddressEqual(spender, pool)) {
    assertPoolApprovalToken(token, quote.action, market)
    return
  }
  assertAddressField('approval spender', spender, gateway)
  assertAddressField('approval token', token, gatewayApprovalToken(quote))
  assertBorrowAction(quote.action, ['withdrawCollateral', 'close'], 'approve')
}

function gatewayApprovalToken(quote: BorrowQuote): Address {
  const token = quote.execution.providerContext?.aTokenAddress
  if (typeof token === 'string' && isAddress(token)) return token
  failCalldata('providerContext.aTokenAddress', {
    expected: 'aToken address',
    received: String(token),
  })
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
