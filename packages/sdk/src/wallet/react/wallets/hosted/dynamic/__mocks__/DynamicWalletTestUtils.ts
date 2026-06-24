import type { Wallet } from '@dynamic-labs/wallet-connector-core'
import type { Address, Hex, LocalAccount, WalletClient } from 'viem'
import { isHex } from 'viem'
import { vi } from 'vitest'

import { createSigningAccount } from '@/__mocks__/utils.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Options for constructing a mock Dynamic wallet.
 * @description Allows the reported wallet-client account, message signer, and
 * raw connector signer to diverge for reconciliation tests.
 */
export interface MockDynamicWalletOptions {
  walletClientAccount?: LocalAccount
  messageSigningAccount?: LocalAccount
  rawSigningAccount?: LocalAccount
}

/**
 * Mock Dynamic wallet with connector spy access for assertions.
 * @description Matches the Dynamic wallet shape consumed by SDK wallet code and
 * exposes the raw-message connector mock used by tests.
 */
export type MockDynamicWallet =
  DynamicHostedWalletToActionsWalletOptions['wallet'] &
    Wallet & {
      __mock: {
        connector: { signRawMessage: ReturnType<typeof vi.fn> }
      }
    }

/**
 * Normalize a raw hash message passed through Dynamic's connector.
 * @param message - Raw hash with or without the `0x` prefix.
 * @returns Hex hash suitable for viem local-account signing.
 * @throws Error when the message is not valid hex.
 */
export function normalizeRawHash(message: string): Hex {
  const hash = message.startsWith('0x') ? message : `0x${message}`
  if (!isHex(hash)) throw new Error('Expected Dynamic raw message hash')
  return hash
}

/**
 * Sign a raw hash with a mock local account.
 * @param account - Local account used as the signing backend.
 * @param hash - Raw hash to sign.
 * @returns Signature bytes.
 * @throws Error when the account cannot sign raw hashes.
 */
export function signRawHash(account: LocalAccount, hash: Hex): Promise<Hex> {
  if (!account.sign) {
    throw new Error('Mock Dynamic account does not support raw hash signing')
  }
  return account.sign({ hash })
}

/**
 * Create a mock Dynamic wallet for hosted wallet tests.
 * @param options - Optional account overrides for reconciliation cases.
 * @returns Mock Dynamic wallet with a spyable raw-message connector.
 */
export function createMockDynamicWallet({
  walletClientAccount = createSigningAccount(),
  messageSigningAccount = walletClientAccount,
  rawSigningAccount = walletClientAccount,
}: MockDynamicWalletOptions = {}): MockDynamicWallet {
  const mockConnector = {
    signRawMessage: vi.fn(
      ({ message }: { accountAddress: Address; message: string }) =>
        signRawHash(rawSigningAccount, normalizeRawHash(message)),
    ),
  }
  const mockWalletClient = {
    account: { address: walletClientAccount.address },
    signMessage: messageSigningAccount.signMessage,
    signTransaction: messageSigningAccount.signTransaction,
    signTypedData: messageSigningAccount.signTypedData,
  } as unknown as WalletClient
  return {
    connector: mockConnector,
    getWalletClient: vi.fn().mockResolvedValue(mockWalletClient),
    __mock: { connector: mockConnector },
  } as MockDynamicWallet
}
