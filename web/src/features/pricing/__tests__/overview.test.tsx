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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { Route as PricingRoute } from '@/routes/pricing'
import { useAuthStore } from '@/stores/auth-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { Pricing } from '..'
import { getOverviewQuote } from '../lib/overview-prices'
import type { PricingModel } from '../types'

// The chart renderer requires a real canvas; the pricing UI remains real.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const model: PricingModel = {
  id: 1,
  model_name: 'claude-sonnet-4-6',
  vendor_id: 1,
  quota_type: 0,
  model_ratio: 0.75,
  completion_ratio: 5,
  cache_ratio: 0,
  create_cache_ratio: 1.25,
  enable_groups: ['default', 'premium'],
  group_ratio: { default: 1, premium: 0.1 },
}
const clients: QueryClient[] = []
beforeEach(() => {
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})
afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

it('shows the selected group price, explicit free cache and a conservative verified comparison', () => {
  expect(getOverviewQuote(model, 'default')).toMatchObject({
    input: '$1.5',
    output: '$7.5',
    cache: '$0',
    write: '$1.875',
    official: '$3 / $15',
    savings: 50,
    conditional: false,
  })
  expect(getOverviewQuote(model, 'premium')?.input).toBe('$0.15')
  expect(getOverviewQuote(model, 'unknown')).toBeNull()
  expect(
    getOverviewQuote({ ...model, enable_groups: ['premium'] }, 'default')
  ).toBeNull()
  expect(
    getOverviewQuote({ ...model, group_ratio: { default: 0 } }, 'default')
      ?.input
  ).toBe('$0')
  expect(
    getOverviewQuote(
      { ...model, model_name: 'claude-sonnet-4-6-custom' },
      'default'
    )?.official
  ).toBeUndefined()
})

it('keeps all tier ranges and suppresses unconditional savings for request rules', () => {
  const tiered = {
    ...model,
    billing_mode: 'tiered_expr',
    billing_expr:
      'len <= 200000 ? tier("standard", p * 3 + c * 15 + cr * 0 + cc * 3.75) : tier("long", p * 6 + c * 22.5 + cr * 0.3 + cc * 7.5)',
  }
  expect(getOverviewQuote(tiered, 'default')).toMatchObject({
    input: '$3 – $6',
    output: '$15 – $22.5',
    cache: '$0 – $0.3',
    write: '$3.75 – $7.5',
    conditional: true,
  })
  expect(getOverviewQuote(tiered, 'default')?.savings).toBeUndefined()
  expect(
    getOverviewQuote(
      {
        ...tiered,
        billing_expr:
          '(tier("base", p * 1 + c * 5)) * (param("fast") == true ? 6 : 1)',
      },
      'default'
    )
  ).toMatchObject({ conditional: true })
  expect(
    getOverviewQuote(
      { ...tiered, billing_expr: 'tier("request", fixed(0.01))' },
      'default'
    )
  ).toBeNull()
  expect(
    getOverviewQuote({ ...model, quota_type: 1, model_price: 0.4 }, 'default')
  ).toBeNull()
  expect(
    getOverviewQuote(
      {
        ...model,
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
      'default'
    )
  ).toBeNull()
})

it('shows configured group discounts without an external official reference', () => {
  const chatGPTModel: PricingModel = {
    ...model,
    model_name: 'gpt-5.6-sol',
    enable_groups: ['chatgpt'],
    group_ratio: { chatgpt: 0.1 },
  }
  expect(getOverviewQuote(chatGPTModel, 'chatgpt')).toMatchObject({
    input: '$0.15',
    output: '$0.75',
    savings: 90,
  })
  expect(getOverviewQuote(chatGPTModel, 'chatgpt')?.official).toBeUndefined()
})

async function renderPricing(initialEntry = '/pricing/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(['status'], {
    HeaderNavModules: { pricing: { enabled: true, requireAuth: false } },
  })
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/notice') return { data: { success: true, data: '' } }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          data: [
            { ...model, group_ratio: undefined },
            {
              ...model,
              id: 2,
              model_name: 'image-example',
              vendor_id: 2,
              quota_type: 1,
              model_price: 0.4,
            },
            {
              ...model,
              id: 3,
              model_name: 'premium-only',
              enable_groups: ['premium'],
            },
          ],
          vendors: [
            { id: 1, name: 'Anthropic' },
            { id: 2, name: 'Other provider' },
          ],
          group_ratio: { default: 1, premium: 3 },
          usable_group: { default: 'Default', premium: 'Premium' },
          auto_groups: [],
          supported_endpoint: {},
        },
      }
    }
    return { data: { success: true, data: { models: [] } } }
  })
  const root = createRootRoute()
  const pricing = createRoute({
    getParentRoute: () => root,
    path: 'pricing/',
    validateSearch: PricingRoute.options.validateSearch,
    component: Pricing,
  })
  const router = createRouter({
    routeTree: root.addChildren([pricing]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('tab', { name: 'Pricing overview' })
  return { router, get, client, user: userEvent.setup() }
}

it('defaults to overview, filters by vendor, opens details and switches back from the model square', async () => {
  const { user, router } = await renderPricing()
  await screen.findByRole('heading', {
    name: 'Transparent pricing. Pay as you go.',
  })
  let panel = screen.getByRole('tabpanel', { name: 'Pricing overview' })
  expect(within(panel).getAllByText('Group: default')[0]).toBeVisible()
  expect(within(panel).queryByText('premium-only')).not.toBeInTheDocument()
  const modelButton = await within(panel).findByRole('button', {
    name: model.model_name,
  })
  expect(within(panel).getByText('$1.5')).toBeVisible()
  expect(within(panel).getByText('$0')).toBeVisible()
  expect(within(panel).getByText('Other billing units')).toBeVisible()
  await user.click(modelButton)
  const detail = await screen.findByRole('dialog', { name: model.model_name })
  expect(detail).toBeVisible()
  await user.click(within(detail).getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: model.model_name })
    ).not.toBeInTheDocument()
  )
  panel = await screen.findByRole('tabpanel', { name: 'Pricing overview' })
  await user.selectOptions(
    await within(panel).findByRole('combobox', { name: 'Vendor' }),
    '2'
  )
  expect(
    within(panel).queryByRole('button', { name: model.model_name })
  ).not.toBeInTheDocument()
  expect(
    within(panel).getByRole('button', { name: 'image-example' })
  ).toBeVisible()
  expect(
    within(panel).getByRole('button', { name: 'Start for free' })
  ).toHaveAttribute('href', '/sign-up')
  await user.click(screen.getByRole('tab', { name: 'Model Square' }))
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Model Square' })
  ).toBeVisible()
  expect(router.state.location.search).toMatchObject({ section: 'models' })
  await user.click(screen.getByRole('tab', { name: 'Pricing overview' }))
  expect(
    await screen.findByRole('heading', {
      name: 'Transparent pricing. Pay as you go.',
    })
  ).toBeVisible()
})

it('keeps old filtered links in the model square and shows API failures with a retry', async () => {
  const { get, client, user } = await renderPricing('/pricing/?view=table')
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Model Square' })
  ).toBeVisible()
  get.mockImplementation(async (url) => {
    if (url === '/api/pricing') throw new Error('offline')
    return { data: { success: true, data: {} } }
  })
  await act(() => client.invalidateQueries({ queryKey: ['pricing'] }))
  expect(await screen.findByText('Failed to load pricing')).toBeVisible()
  get.mockResolvedValue({
    data: {
      success: true,
      data: [],
      vendors: [],
      group_ratio: {},
      usable_group: {},
      auto_groups: [],
    },
  })
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await user.click(screen.getByRole('tab', { name: 'Pricing overview' }))
  expect(await screen.findByText('No Models Found')).toBeVisible()
})

it('refreshes account-scoped prices when signing in and never reuses the anonymous group quote', async () => {
  const { user, get } = await renderPricing()
  await screen.findByRole('heading', {
    name: 'Transparent pricing. Pay as you go.',
  })
  await act(async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 42, username: 'customer', role: 1, group: 'premium' })
  })
  const panel = await screen.findByRole('tabpanel', {
    name: 'Pricing overview',
  })
  expect((await within(panel).findAllByText('Group: premium'))[0]).toBeVisible()
  expect(within(panel).getAllByText('$4.5').length).toBeGreaterThan(0)
  expect(get.mock.calls.filter(([url]) => url === '/api/pricing')).toHaveLength(
    2
  )
  expect(
    within(panel).getByRole('button', { name: 'API Key' })
  ).toHaveAttribute('href', '/keys')
  await user.type(
    within(panel).getByRole('textbox', { name: 'Search models' }),
    'nothing-matches'
  )
  expect(await within(panel).findByText('No Models Found')).toBeVisible()
})
