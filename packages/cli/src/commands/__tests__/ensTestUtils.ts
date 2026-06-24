import { mainnet } from 'viem/chains'
import { vi } from 'vitest'

import * as baseCtx from '@/context/baseContext.js'

type ChainConfig = { chainId: number }

export function mockEnsActions(
  ens: Record<string, unknown>,
  chains: ChainConfig[] = [{ chainId: mainnet.id }],
): void {
  vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
    config: { chains } as never,
    actions: { ens } as never,
  })
}
