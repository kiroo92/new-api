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
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { getCurrencyLabel } from '@/lib/currency'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  getOverviewQuote,
  OFFICIAL_PRICING_CHECKED,
  OFFICIAL_PRICING_SOURCE,
} from '../lib/overview-prices'
import type { PricingModel, PricingVendor } from '../types'
import { ModelPriceCell } from './model-price-cell'
import { PricingTable } from './pricing-table'
import { SearchBar } from './search-bar'

export function PricingOverview(props: {
  models: PricingModel[]
  vendors: PricingVendor[]
  groupRatio: Record<string, number>
  routingGroups?: string[]
  onModelClick: (name: string) => void
  onBrowse: () => void
}) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const accountGroup = user?.group || 'default'
  const groups = useMemo(
    () => props.routingGroups ?? [accountGroup],
    [props.routingGroups, accountGroup]
  )
  const currencyLabel =
    currency.quotaDisplayType === 'TOKENS' ? 'USD' : getCurrencyLabel()
  const [search, setSearch] = useState('')
  const [vendor, setVendor] = useState('all')
  const models = useMemo(() => {
    return props.models
      .filter(
        (model) =>
          (vendor === 'all' || String(model.vendor_id) === vendor) &&
          `${model.model_name} ${model.vendor_name ?? ''}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
      )
      .flatMap((model) => {
        const group = groups.find((candidate) => {
          const ratio = props.groupRatio[candidate]
          return (
            (model.enable_groups.includes(candidate) ||
              model.enable_groups.includes('all')) &&
            typeof ratio === 'number' &&
            Number.isFinite(ratio) &&
            ratio >= 0
          )
        })
        return group
          ? [
              {
                ...model,
                enable_groups: [group],
                group_ratio: props.groupRatio,
              },
            ]
          : []
      })
      .sort(
        (a, b) =>
          Number(!a.model_name.toLowerCase().startsWith('claude-')) -
            Number(!b.model_name.toLowerCase().startsWith('claude-')) ||
          a.model_name.localeCompare(b.model_name)
      )
  }, [props.models, props.groupRatio, groups, vendor, search])
  const quotes = useMemo(
    () =>
      new Map(
        models.map((model) => [
          model.model_name,
          getOverviewQuote(model, model.enable_groups[0]),
        ])
      ),
    // Formatters read the currency store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [models, currency]
  )
  const tokenModels = models.filter((model) => quotes.get(model.model_name))
  const otherModels = models.filter((model) => !quotes.get(model.model_name))
  const modelColumn: ColumnDef<PricingModel> = {
    id: 'model',
    header: t('Model'),
    size: 245,
    cell: ({ row }) => (
      <div className='py-2'>
        <Button
          variant='link'
          className='h-auto max-w-full px-0 text-left whitespace-normal'
          onClick={() => props.onModelClick(row.original.model_name)}
        >
          {row.original.model_name}
        </Button>
        <p data-table-text='secondary' className='text-muted-foreground mt-1'>
          {quotes.get(row.original.model_name)?.conditional
            ? t('Rates vary by usage conditions')
            : row.original.vendor_name}
        </p>
        <p data-table-text='secondary' className='text-muted-foreground mt-1'>
          {t('Group')}: {row.original.enable_groups[0]}
        </p>
      </div>
    ),
  }
  const columns: ColumnDef<PricingModel>[] = [
    modelColumn,
    ...(
      [
        ['input', t('Input')],
        ['output', t('Output')],
        ['cache', t('Cache Read')],
        ['write', t('Cache Write (5m)')],
      ] as const
    ).map(([field, label]) => ({
      id: field,
      header: label,
      size: 125,
      cell: ({ row }: { row: { original: PricingModel } }) => (
        <span className='whitespace-nowrap tabular-nums'>
          {quotes.get(row.original.model_name)?.[field] ?? '—'}
        </span>
      ),
    })),
    {
      id: 'official',
      header: t('Official input / output'),
      size: 170,
      cell: ({ row }) => {
        const quote = quotes.get(row.original.model_name)
        if (!quote?.official) {
          return <span className='text-muted-foreground'>—</span>
        }
        return (
          <div className='space-y-1 py-2'>
            <span className='text-muted-foreground whitespace-nowrap'>
              {quote.official}
            </span>
            {quote.savings !== undefined && (
              <p data-table-text='secondary' className='text-brand'>
                {t('Save at least {{percent}}%', { percent: quote.savings })}
              </p>
            )}
          </div>
        )
      },
    },
  ]
  return (
    <div className='space-y-8'>
      <section aria-label={t('Model pricing')} className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <h2 className='text-lg font-semibold'>{t('Model pricing')}</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('{{currency}} / {{unit}} tokens', {
                currency: currencyLabel,
                unit: '1M',
              })}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <SearchBar
              value={search}
              onChange={setSearch}
              onClear={() => setSearch('')}
              className='min-w-0 flex-1 sm:w-64'
            />
            <NativeSelect
              aria-label={t('Vendor')}
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
            >
              <NativeSelectOption value='all'>
                {t('All providers')}
              </NativeSelectOption>
              {props.vendors.map((item) => (
                <NativeSelectOption key={item.id} value={String(item.id)}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('Group')}: {groups.join(', ') || '—'}
        </p>
        {models.length === 0 && (
          <EmptyState
            title={t('No Models Found')}
            description={t('No models match your current filters.')}
          />
        )}
        {tokenModels.length > 0 && (
          <PricingTable
            key={groups.join(',') + vendor + search}
            models={tokenModels}
            columns={columns}
            onModelClick={props.onModelClick}
          />
        )}
        {otherModels.length > 0 && (
          <section aria-label={t('Other billing units')} className='space-y-3'>
            <h3 className='text-sm font-semibold'>
              {t('Other billing units')}
            </h3>
            <PricingTable
              key={groups.join(',') + vendor + search}
              models={otherModels}
              onModelClick={props.onModelClick}
              columns={[
                modelColumn,
                {
                  id: 'price',
                  header: t('Price'),
                  size: 360,
                  cell: ({ row }) => (
                    <ModelPriceCell
                      model={row.original}
                      options={{
                        selectedGroup: row.original.enable_groups[0],
                        tokenUnit: 'M',
                      }}
                      showExpression={false}
                    />
                  ),
                },
                {
                  id: 'details',
                  header: t('Details'),
                  size: 140,
                  cell: ({ row }) => (
                    <Button
                      variant='outline'
                      onClick={() =>
                        props.onModelClick(row.original.model_name)
                      }
                    >
                      {t('View details')}
                    </Button>
                  ),
                },
              ]}
            />
          </section>
        )}
        <div className='text-muted-foreground space-y-2 text-xs leading-relaxed'>
          <p>
            {t(
              'Prices are deducted from your balance. Recharge offers are not included.'
            )}
          </p>
          <p>
            {t(
              'Ranges cover pricing tiers. Context length, cache duration, tools and request options may affect the final charge. Open a model for full details.'
            )}
          </p>
          <p>
            {t(
              'A dash means no separate rate or verified reference is available; it does not mean free.'
            )}
          </p>
          <p>
            <a
              href={OFFICIAL_PRICING_SOURCE}
              target='_blank'
              rel='noreferrer'
              className='underline underline-offset-4'
            >
              {t('Official pricing reference')}
            </a>
            {' · '}
            {t(
              'Checked {{date}}. Standard API input/output only; savings use the lower of the two discounts.',
              { date: OFFICIAL_PRICING_CHECKED }
            )}
          </p>
        </div>
      </section>
      <section className='bg-card flex flex-col gap-6 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8'>
        <div>
          <h2 className='text-xl font-semibold'>
            {t('One API key. All your available models.')}
          </h2>
          <p className='text-muted-foreground mt-2 text-sm'>
            {t(
              'Your API key is created when you sign up. Start with the model that fits your needs.'
            )}
          </p>
        </div>
        <div className='flex shrink-0 flex-wrap gap-2'>
          <Button size='lg' render={<Link to={user ? '/keys' : '/sign-up'} />}>
            {user ? t('API Key') : t('Start for free')}
            <ArrowRight aria-hidden='true' />
          </Button>
          <Button size='lg' variant='outline' onClick={props.onBrowse}>
            {t('Browse model square')}
          </Button>
        </div>
      </section>
    </div>
  )
}
