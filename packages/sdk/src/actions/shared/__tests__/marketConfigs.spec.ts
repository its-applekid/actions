import { describe, expect, it } from 'vitest'

import {
  filterMatchingConfigs,
  findMatchingConfig,
  selectAllowedConfigs,
} from '@/actions/shared/marketConfigs.js'

describe('marketConfigs', () => {
  const configs = [
    { chainId: 10, symbol: 'USDC', enabled: true },
    { chainId: 8453, symbol: 'WETH', enabled: true },
    { chainId: 8453, symbol: 'USDC', enabled: false },
  ] as const

  describe('findMatchingConfig', () => {
    it('returns the first config matching the target', () => {
      const match = findMatchingConfig({
        configs,
        target: { chainId: 8453, symbol: 'USDC' },
        matches: (config, target) =>
          config.chainId === target.chainId && config.symbol === target.symbol,
      })

      expect(match).toEqual(configs[2])
    })

    it('returns undefined when nothing matches', () => {
      const match = findMatchingConfig({
        configs,
        target: { chainId: 1, symbol: 'DAI' },
        matches: (config, target) =>
          config.chainId === target.chainId && config.symbol === target.symbol,
      })

      expect(match).toBeUndefined()
    })
  })

  describe('filterMatchingConfigs', () => {
    it('applies only the defined predicates', () => {
      const filtered = filterMatchingConfigs(configs, [
        (config) => config.chainId === 8453,
        undefined,
        (config) => config.enabled,
      ])

      expect(filtered).toEqual([configs[1]])
    })

    it('returns an empty list for missing configs', () => {
      expect(filterMatchingConfigs(undefined, [])).toEqual([])
    })
  })

  describe('selectAllowedConfigs', () => {
    it('returns matched allowlist entries and drops blocklisted matches', () => {
      const candidate = { chainId: 8453, symbol: 'usdc', enabled: false }

      const selected = selectAllowedConfigs({
        candidates: [candidate, configs[1]],
        allowlist: configs,
        blocklist: [configs[1]],
        matches: (config, target) =>
          config.chainId === target.chainId &&
          config.symbol.toLowerCase() === target.symbol.toLowerCase(),
      })

      expect(selected).toEqual([configs[2]])
    })

    it('fails closed when the allowlist is missing', () => {
      const selected = selectAllowedConfigs({
        candidates: [configs[0]],
        allowlist: undefined,
        blocklist: undefined,
        matches: (config, target) =>
          config.chainId === target.chainId && config.symbol === target.symbol,
      })

      expect(selected).toEqual([])
    })
  })
})
