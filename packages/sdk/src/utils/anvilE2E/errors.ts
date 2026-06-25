import { ActionsError } from '@/core/error/errors.js'

/**
 * Fork e2e configuration error.
 * @description Thrown when a reusable fork helper is called without the
 * scenario fields required to run the requested path.
 */
export class ForkE2EConfigError extends ActionsError {
  override name = 'ForkE2EConfigError' as const

  /**
   * Create an instance of ForkE2EConfigError.
   * @param message - Concrete configuration problem.
   */
  constructor(message: string) {
    super(message)
  }
}

/**
 * Fork e2e JSON-RPC error.
 * @description Thrown when an Anvil-only JSON-RPC helper returns an error
 * response or an unexpected payload.
 */
export class ForkE2EAnvilRpcError extends ActionsError {
  override name = 'ForkE2EAnvilRpcError' as const

  /**
   * Create an instance of ForkE2EAnvilRpcError.
   * @param params - RPC method and failure details.
   */
  constructor(params: { method: string; details: string }) {
    super(`Anvil RPC ${params.method} failed`, {
      metaMessages: [params.details],
    })
  }
}

/**
 * Fork e2e receipt error.
 * @description Thrown when a mined transaction or user operation receipt is
 * present but did not succeed.
 */
export class ForkE2EReceiptError extends ActionsError {
  override name = 'ForkE2EReceiptError' as const

  /**
   * Create an instance of ForkE2EReceiptError.
   * @param params - Receipt status and identifying hash details.
   */
  constructor(params: { hash?: string; status?: string }) {
    super('Fork e2e transaction did not succeed', {
      metaMessages: [
        `status: ${params.status ?? 'unknown'}`,
        `hash: ${params.hash ?? 'unknown'}`,
      ],
    })
  }
}
