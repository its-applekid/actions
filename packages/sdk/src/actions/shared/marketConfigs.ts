/**
 * Find the first config that matches a target value.
 * @description Shared identity lookup for market config lists. Callers provide
 * the domain-specific comparator so the helper does not know about a market's
 * address, chain, kind, or provider fields.
 * @param configs - Candidate configs to search
 * @param target - Value to compare against each config
 * @param matches - Domain-specific comparator
 * @returns The first matching config, or undefined when no config matches
 */
export function findMatchingConfig<TConfig, TTarget>(params: {
  configs: readonly TConfig[] | undefined
  target: TTarget
  matches: (config: TConfig, target: TTarget) => boolean
}): TConfig | undefined {
  return params.configs?.find((config) => params.matches(config, params.target))
}

/**
 * Filter configs by a list of optional predicates.
 * @description Applies each defined predicate in order and skips undefined
 * predicates so callers can build filter arrays from optional request fields.
 * @param configs - Candidate configs
 * @param predicates - Predicates to apply when defined
 * @returns Filtered configs
 */
export function filterMatchingConfigs<TConfig>(
  configs: readonly TConfig[] | undefined,
  predicates: ReadonlyArray<((config: TConfig) => boolean) | undefined>,
): TConfig[] {
  let filtered = [...(configs ?? [])]
  for (const predicate of predicates) {
    if (predicate) filtered = filtered.filter(predicate)
  }
  return filtered
}

/**
 * Intersect candidate configs with an allowlist and drop blocklisted matches.
 * Returns trusted allowlist entries, never caller-supplied candidate objects.
 */
export function selectAllowedConfigs<TConfig>(params: {
  candidates: readonly TConfig[]
  allowlist: readonly TConfig[] | undefined
  blocklist: readonly TConfig[] | undefined
  matches: (config: TConfig, target: TConfig) => boolean
}): TConfig[] {
  return params.candidates.flatMap((candidate) => {
    const allowed = findMatchingConfig({
      configs: params.allowlist,
      target: candidate,
      matches: params.matches,
    })
    if (!allowed) return []

    const blocked = findMatchingConfig({
      configs: params.blocklist,
      target: candidate,
      matches: params.matches,
    })
    return blocked ? [] : [allowed]
  })
}
