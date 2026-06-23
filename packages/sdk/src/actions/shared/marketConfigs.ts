/**
 * Find the first config that matches a target value.
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
 * @param candidates - Candidate configs to filter
 * @param allowlist - Trusted configs candidates must match
 * @param blocklist - Trusted configs candidates must not match
 * @param matches - Structural comparator for config identity
 * @returns Allowlist entries matched by candidates and absent from the blocklist
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
