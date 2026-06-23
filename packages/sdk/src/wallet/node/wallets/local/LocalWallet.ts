import type { Address, LocalAccount } from 'viem'

import { reconcileSignerAddress } from '@/wallet/core/utils/reconcileSignerAddress.js'
import type { BaseWalletCreateOptions } from '@/wallet/core/wallets/abstract/Wallet.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

interface LocalWalletCreateOptions extends BaseWalletCreateOptions {
  account: LocalAccount
}

/**
 * Local wallet implementation
 * @description Wallet backed by a viem LocalAccount provided by the developer.
 * The SDK never handles raw private key material; the developer creates the
 * LocalAccount themselves (e.g. via privateKeyToAccount) and passes it in.
 */
export class LocalWallet extends EOAWallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  private constructor(params: LocalWalletCreateOptions) {
    const {
      account,
      chainManager,
      actionProviders,
      actionSettings,
      supportedAssets,
    } = params
    super({ chainManager, actionProviders, actionSettings, supportedAssets })
    this.signer = account
    this.address = account.address
  }

  static async create(params: LocalWalletCreateOptions): Promise<LocalWallet> {
    const wallet = new LocalWallet(params)
    await wallet.initialize()
    return wallet
  }

  /**
   * Reconcile the developer-supplied account before the wallet is usable.
   * @description The account is trusted verbatim as both the reported address
   * and the signing backend. This also closes the `isLocalAccount` bypass: a
   * hosted-derived signer (Privy/Turnkey/Dynamic is `type: 'local'`) routed
   * back through `WalletNamespace.toActionsWallet` lands here, so the
   * reconciliation seam is enforced regardless of which branch built the
   * wallet. A genuine `privateKeyToAccount` reconciles locally with no network.
   */
  protected override async performInitialization(): Promise<void> {
    await reconcileSignerAddress(this.signer)
  }
}
