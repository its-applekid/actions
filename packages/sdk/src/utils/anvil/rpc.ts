import { ForkE2EAnvilRpcError } from '@/utils/anvil/errors.js'

interface JsonRpcErrorPayload {
  code: number
  data?: unknown
  message: string
}

interface JsonRpcFailure {
  error: JsonRpcErrorPayload
  id: number
  jsonrpc: '2.0'
}

interface JsonRpcSuccess {
  id: number
  jsonrpc: '2.0'
  result: unknown
}

let nextRpcId = 1

/**
 * Send an Anvil JSON-RPC request.
 * @description Thin test-support RPC helper for Anvil-only methods such as
 * account impersonation and direct balance assignment.
 * @param rpcUrl - Local Anvil JSON-RPC URL.
 * @param method - Anvil JSON-RPC method to call.
 * @param params - Positional JSON-RPC parameters.
 * @returns Promise that resolves when Anvil returns a success payload.
 * @throws ForkE2EAnvilRpcError when the HTTP or JSON-RPC request fails.
 */
export async function requestAnvilRpc(
  rpcUrl: string,
  method: string,
  params: readonly unknown[],
): Promise<void> {
  const response = await postJsonRpc(rpcUrl, method, params)
  if (!response.ok) {
    throw new ForkE2EAnvilRpcError({
      method,
      details: `HTTP ${response.status}`,
    })
  }

  const payload = await parseJsonRpcResponse(response, method)
  validateJsonRpcPayload(method, payload)
}

async function postJsonRpc(
  rpcUrl: string,
  method: string,
  params: readonly unknown[],
): Promise<Response> {
  try {
    return await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: nextRpcId++,
        jsonrpc: '2.0',
        method,
        params,
      }),
    })
  } catch (cause) {
    throw buildTransportError(method, cause)
  }
}

async function parseJsonRpcResponse(
  response: Response,
  method: string,
): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw buildParseError(method, cause)
  }
}

function validateJsonRpcPayload(method: string, payload: unknown): void {
  if (isJsonRpcFailure(payload)) {
    throw new ForkE2EAnvilRpcError({
      method,
      details: payload.error.message,
    })
  }
  if (!isJsonRpcSuccess(payload)) {
    throw new ForkE2EAnvilRpcError({
      method,
      details: 'Unexpected JSON-RPC response payload',
    })
  }
}

function isJsonRpcFailure(value: unknown): value is JsonRpcFailure {
  return isRecord(value) && isJsonRpcErrorPayload(value.error)
}

function isJsonRpcSuccess(value: unknown): value is JsonRpcSuccess {
  return isRecord(value) && 'result' in value
}

function isJsonRpcErrorPayload(value: unknown): value is JsonRpcErrorPayload {
  return (
    isRecord(value) &&
    typeof value.code === 'number' &&
    typeof value.message === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function buildTransportError(
  method: string,
  cause: unknown,
): ForkE2EAnvilRpcError {
  return new ForkE2EAnvilRpcError({
    method,
    details: errorDetails(cause, 'HTTP request failed'),
    cause: errorCause(cause),
  })
}

function buildParseError(method: string, cause: unknown): ForkE2EAnvilRpcError {
  return new ForkE2EAnvilRpcError({
    method,
    details: errorDetails(cause, 'Invalid JSON-RPC response body'),
    cause: errorCause(cause),
  })
}

function errorCause(cause: unknown): Error | undefined {
  return cause instanceof Error ? cause : undefined
}

function errorDetails(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}
