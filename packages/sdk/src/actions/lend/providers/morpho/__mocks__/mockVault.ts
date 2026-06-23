import {
  AccrualPosition,
  AccrualVault,
  type Address,
} from '@morpho-org/blue-sdk'

const VAULT_ADDRESS = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address
const LOAN_TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const OWNER = '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as Address
const CURATOR = '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as Address

const createMockPosition = (): AccrualPosition => {
  const position = new AccrualPosition(
    {
      user: VAULT_ADDRESS,
      supplyShares: 1000000n * 10n ** 6n,
      borrowShares: 0n,
      collateral: 0n,
    },
    {
      params: {
        loanToken: LOAN_TOKEN,
        collateralToken: ZERO_ADDRESS,
        oracle: ZERO_ADDRESS,
        irm: ZERO_ADDRESS,
        lltv: 0n,
      },
      totalSupplyAssets: 1000000n * 10n ** 6n,
      totalBorrowAssets: 0n,
      totalSupplyShares: 1000000n * 10n ** 6n,
      totalBorrowShares: 0n,
      lastUpdate: 0n,
      fee: 0n,
    },
  )
  Object.defineProperty(position.market, 'supplyApy', {
    value: BigInt(3e16),
  })
  return position
}

/**
 * Creates a mock Morpho vault for testing
 */
export function createMockMorphoVault() {
  const position = createMockPosition()

  return new AccrualVault(
    {
      address: VAULT_ADDRESS,
      name: 'Mock MetaMorpho USDC',
      symbol: 'mmUSDC',
      decimalsOffset: 0n,
      asset: LOAN_TOKEN,
      totalSupply: 10000000n * 10n ** 6n,
      fee: BigInt(1e17),
      owner: OWNER,
      curator: CURATOR,
      guardian: ZERO_ADDRESS,
      feeRecipient: OWNER,
      skimRecipient: OWNER,
      pendingTimelock: { value: 0n, validAt: 0n },
      pendingGuardian: { value: ZERO_ADDRESS, validAt: 0n },
      pendingOwner: OWNER,
      timelock: 0n,
      supplyQueue: [position.market.id],
      lastTotalAssets: 10000000n * 10n ** 6n,
    },
    [
      {
        config: {
          vault: VAULT_ADDRESS,
          marketId: position.market.id,
          cap: 10000000n * 10n ** 6n,
          pendingCap: { value: 0n, validAt: 0n },
          removableAt: 0n,
          enabled: true,
        },
        position,
      },
    ],
  )
}
