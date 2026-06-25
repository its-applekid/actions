import type { Abi, Address } from 'viem'

/**
 * Canonical Multicall3 deployment address. Multicall3 is deployed at this same
 * address on every OP Stack chain and most other EVM chains.
 * @see https://github.com/mds1/multicall
 */
export const MULTICALL3_ADDRESS: Address =
  '0xcA11bde05977b3631167028862bE2a173976CA11'

/**
 * Minimal Multicall3 ABI fragment exposing `getEthBalance`.
 * Enables native balance reads in the same batch as ERC-20 `balanceOf`.
 */
export const multicall3GetEthBalanceAbi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getEthBalance',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const satisfies Abi
