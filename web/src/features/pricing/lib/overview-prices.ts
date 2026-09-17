/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import type { PricingModel } from '../types'
import {
  formatDynamicUnitPrice,
  getDynamicPriceEntries,
  getDynamicPricingTiers,
  hasDynamicRequestRules,
  hasTaskUsageSchema,
  isDynamicPricingModel,
} from './dynamic-price'
import { formatGroupPrice } from './price'

export const OFFICIAL_PRICING_SOURCE =
  'https://platform.claude.com/docs/en/about-claude/pricing'
export const OFFICIAL_PRICING_CHECKED = '2026-09-17'

// Display-only standard API references, USD / 1M tokens. Exact IDs only:
// custom aliases and provider-specific variants must not inherit comparisons.
const officialPrices: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

export type OverviewQuote = {
  input: string
  output: string
  cache: string
  write: string
  conditional: boolean
  official?: string
  savings?: number
}

/** Only show prices for the account/default group; never choose a cheaper group. */
export function getOverviewQuote(
  model: PricingModel,
  group: string
): OverviewQuote | null {
  const ratio = model.group_ratio?.[group]
  if (
    (!model.enable_groups.includes(group) &&
      !model.enable_groups.includes('all')) ||
    typeof ratio !== 'number' ||
    !Number.isFinite(ratio) ||
    ratio < 0 ||
    hasTaskUsageSchema(model) ||
    model.billing_plugin_variants?.length
  ) {
    return null
  }

  let inputUSD: number | undefined
  let outputUSD: number | undefined
  const quote: OverviewQuote = {
    input: '—',
    output: '—',
    cache: '—',
    write: '—',
    conditional: false,
  }
  if (isDynamicPricingModel(model)) {
    const tiers = getDynamicPricingTiers(model)
    if (!tiers.length) return null
    const options = { tokenUnit: 'M' as const, groupRatioMultiplier: ratio }
    const entries = tiers.map((tier) => getDynamicPriceEntries(tier, options))
    if (
      entries.some(
        (items) =>
          !items.length || items.some((entry) => entry.unit !== 'token')
      )
    ) {
      return null
    }
    quote.conditional = tiers.length > 1 || hasDynamicRequestRules(model)
    for (const [column, field] of [
      ['input', 'inputPrice'],
      ['output', 'outputPrice'],
      ['cache', 'cacheReadPrice'],
      ['write', 'cacheCreatePrice'],
    ] as const) {
      const values = entries.map(
        (items) => items.find((entry) => entry.field === field)?.value
      )
      // A missing rate in a tier is not a zero price.
      if (values.some((value) => value === undefined)) continue
      const minimum = Math.min(...(values as number[]))
      const maximum = Math.max(...(values as number[]))
      quote[column] =
        minimum === maximum
          ? formatDynamicUnitPrice(minimum, options)
          : `${formatDynamicUnitPrice(minimum, options)} – ${formatDynamicUnitPrice(maximum, options)}`
      if (!quote.conditional && column === 'input') inputUSD = minimum * ratio
      if (!quote.conditional && column === 'output') outputUSD = minimum * ratio
    }
  } else {
    if (
      model.billing_mode === 'tiered_expr' ||
      model.quota_type !== 0 ||
      !Number.isFinite(model.model_ratio) ||
      model.model_ratio < 0 ||
      !Number.isFinite(model.completion_ratio) ||
      model.completion_ratio < 0
    ) {
      return null
    }
    for (const [column, type] of [
      ['input', 'input'],
      ['output', 'output'],
      ['cache', 'cache'],
      ['write', 'create_cache'],
    ] as const) {
      const value = formatGroupPrice(
        model,
        group,
        type,
        'M',
        false,
        1,
        1,
        model.group_ratio ?? {}
      )
      quote[column] = value === '-' ? '—' : value
    }
    inputUSD = model.model_ratio * 2 * ratio
    outputUSD = inputUSD * model.completion_ratio
  }
  const official = Object.hasOwn(officialPrices, model.model_name)
    ? officialPrices[model.model_name]
    : undefined
  if (official) {
    quote.official = `${formatBillingCurrencyFromUSD(official.input)} / ${formatBillingCurrencyFromUSD(official.output)}`
    if (inputUSD !== undefined && outputUSD !== undefined) {
      // Conservative saving: both input and output must save at least this much.
      const savings = Math.floor(
        Math.min(
          1 - inputUSD / official.input,
          1 - outputUSD / official.output
        ) * 100
      )
      if (savings > 0) quote.savings = savings
    }
  }
  return quote
}
