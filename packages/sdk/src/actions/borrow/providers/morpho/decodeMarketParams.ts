import { type Address, isAddress } from 'viem'

import {
  assertAddressField,
  assertAmountField,
  failCalldata,
} from '@/actions/borrow/core/calldataValidation.js'
import type { MorphoMarketParams } from '@/types/borrow/index.js'

export function assertMorphoMarketParams(
  actual: unknown,
  expected: MorphoMarketParams,
): void {
  const params = normalizeMarketParams(actual)
  if (!params) {
    failCalldata('marketParams', { detail: 'unable to decode market params' })
  }
  assertAddressField('loanToken', params.loanToken, expected.loanToken)
  assertAddressField(
    'collateralToken',
    params.collateralToken,
    expected.collateralToken,
  )
  assertAddressField('oracle', params.oracle, expected.oracle)
  assertAddressField('irm', params.irm, expected.irm)
  assertAmountField('lltv', params.lltv, expected.lltv)
}

function normalizeMarketParams(value: unknown): MorphoMarketParams | undefined {
  const tuple = normalizeMarketParamsTuple(value)
  if (tuple) return tuple
  if (typeof value !== 'object' || value === null) return undefined
  if (!('loanToken' in value) || !('lltv' in value)) return undefined
  return normalizeMarketParamsObject({
    loanToken: value.loanToken,
    collateralToken:
      'collateralToken' in value ? value.collateralToken : undefined,
    oracle: 'oracle' in value ? value.oracle : undefined,
    irm: 'irm' in value ? value.irm : undefined,
    lltv: value.lltv,
  })
}

function normalizeMarketParamsTuple(
  value: unknown,
): MorphoMarketParams | undefined {
  if (!Array.isArray(value)) return undefined
  return normalizeMarketParamsObject({
    loanToken: value[0],
    collateralToken: value[1],
    oracle: value[2],
    irm: value[3],
    lltv: value[4],
  })
}

function normalizeMarketParamsObject(value: {
  loanToken: unknown
  collateralToken: unknown
  oracle: unknown
  irm: unknown
  lltv: unknown
}): MorphoMarketParams | undefined {
  if (!isDecodedAddress(value.loanToken)) return undefined
  if (!isDecodedAddress(value.collateralToken)) return undefined
  if (!isDecodedAddress(value.oracle)) return undefined
  if (!isDecodedAddress(value.irm)) return undefined
  if (typeof value.lltv !== 'bigint') return undefined
  return {
    loanToken: value.loanToken,
    collateralToken: value.collateralToken,
    oracle: value.oracle,
    irm: value.irm,
    lltv: value.lltv,
  }
}

function isDecodedAddress(value: unknown): value is Address {
  return typeof value === 'string' && isAddress(value)
}
