import type { Address, Hex } from 'viem'
import { decodeAbiParameters } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  MockETHAsset,
  MockUSDCAsset,
  MockWETHAsset,
} from '@/__mocks__/MockAssets.js'
import { UNIVERSAL_ROUTER_ABI } from '@/actions/swap/providers/velodrome/abis.js'
import {
  decodeCLSwapRecipient,
  encodeCLSwap,
  encodeSwap,
} from '@/actions/swap/providers/velodrome/encoding/index.js'
import { V3_SWAP_EXACT_IN_INPUT_PARAMS } from '@/actions/swap/providers/velodrome/encoding/routers/cl.js'
import {
  InvalidRecipientError,
  NativeAssetNotSupportedError,
} from '@/core/error/errors.js'

import {
  BASE_CHAIN_ID,
  DEADLINE,
  decode,
  FACTORY,
  RECIPIENT,
} from './encoding.helpers.js'

const BAD_CHECKSUM_RECIPIENT =
  '0x000000000000000000000000000000000000DeAd' as Address
const OTHER_RECIPIENT = '0x1111111111111111111111111111111111111111' as Address

describe('encodeCLSwap', () => {
  it('encodes V3_SWAP_EXACT_IN command (0x00)', () => {
    const data = encodeCLSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      tickSpacing: 100,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    const { functionName, args } = decode<[string, string[], bigint]>(
      UNIVERSAL_ROUTER_ABI,
      data,
    )
    expect(functionName).toBe('execute')
    const [commands, inputs, deadline] = args
    expect(commands).toBe('0x00')
    expect(inputs).toHaveLength(1)
    expect(deadline).toBe(BigInt(DEADLINE))
    expect(decodeCLSwapRecipient(data)).toBe(RECIPIENT)
  })

  // Regression for #438: payerIsUser must be true so the router pulls tokens via
  // transferFrom against an ERC20 allowance. See encoding.v2.test.ts for context.
  it('encodes V3_SWAP_EXACT_IN with payerIsUser = true', () => {
    const data = encodeCLSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      tickSpacing: 100,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    const { args } = decode<[Hex, Hex[], bigint]>(UNIVERSAL_ROUTER_ABI, data)
    const [, inputs] = args
    const decoded = decodeAbiParameters(
      V3_SWAP_EXACT_IN_INPUT_PARAMS,
      inputs[0],
    )
    const payerIsUserIdx = V3_SWAP_EXACT_IN_INPUT_PARAMS.findIndex(
      (p) => p.name === 'payerIsUser',
    )
    expect(decoded[payerIsUserIdx]).toBe(true)
    const recipientIdx = V3_SWAP_EXACT_IN_INPUT_PARAMS.findIndex(
      (p) => p.name === 'recipient',
    )
    expect(decoded[recipientIdx]).toBe(RECIPIENT)
  })

  it('routes to a non-self recipient instead of the msg.sender sentinel', () => {
    const data = encodeCLSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      tickSpacing: 100,
      recipient: OTHER_RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    expect(decodeCLSwapRecipient(data)).toBe(OTHER_RECIPIENT)
  })

  it('rejects a malformed or mis-checksummed recipient before encoding', () => {
    expect(() =>
      encodeCLSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
        amountOutMin: 400000000000000000n,
        tickSpacing: 100,
        recipient: BAD_CHECKSUM_RECIPIENT,
        deadline: DEADLINE,
        chainId: BASE_CHAIN_ID,
      }),
    ).toThrow(InvalidRecipientError)
  })

  it('rejects native input because no WRAP_ETH command is emitted', () => {
    expect(() =>
      encodeCLSwap({
        assetIn: MockETHAsset,
        assetOut: MockUSDCAsset,
        amountInRaw: 1000000000000000000n,
        amountOutMin: 900000n,
        tickSpacing: 100,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: BASE_CHAIN_ID,
      }),
    ).toThrow(NativeAssetNotSupportedError)
  })

  it('produces different calldata than V2 universal router swap', () => {
    const clData = encodeCLSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      tickSpacing: 100,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    const v2Data = encodeSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      routerType: 'universal',
      stable: false,
      factoryAddress: FACTORY,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    expect(clData).not.toBe(v2Data)
  })
})
