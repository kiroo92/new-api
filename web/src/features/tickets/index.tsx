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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/react-table'
import { Plus, RefreshCw, MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { getTickets, type Ticket } from './api'
import { CreateTicketDialog } from './components/create-ticket-dialog'
import { TicketDetailDialog } from './components/ticket-detail-dialog'
import { ticketOptions } from './options'

export function Tickets(props: { management?: boolean }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const management = props.management ?? false
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const options = ticketOptions(t)
  const query = useQuery({
    queryKey: ['tickets', management, { status, search, filters, pagination }],
    queryFn: () =>
      getTickets(management, {
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        keyword: search,
        status: status === 'all' ? '' : status,
        category:
          (
            filters.find((filter) => filter.id === 'category')?.value as
              | string[]
              | undefined
          )?.[0] ?? '',
        priority:
          (
            filters.find((filter) => filter.id === 'priority')?.value as
              | string[]
              | undefined
          )?.[0] ?? '',
      }),
  })
  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: 'subject',
      header: t('Subject'),
      cell: ({ row }) => (
        <Button
          variant='link'
          className='h-auto max-w-full justify-start py-1 text-left whitespace-normal'
          onClick={() => setSelected(row.original.id)}
        >
          <span className='line-clamp-2 break-all'>{row.original.subject}</span>
        </Button>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'resolved' ? 'secondary' : 'outline'}
        >
          {
            options.status.find(
              (option) => option.value === row.original.status
            )?.label
          }
        </Badge>
      ),
    },
    {
      accessorKey: 'priority',
      header: t('Priority'),
      cell: ({ row }) =>
        options.priority.find(
          (option) => option.value === row.original.priority
        )?.label,
    },
    {
      accessorKey: 'category',
      header: t('Category'),
      cell: ({ row }) =>
        options.category.find(
          (option) => option.value === row.original.category
        )?.label,
    },
    ...(management ? [{ accessorKey: 'username', header: t('User') }] : []),
    {
      accessorKey: 'updated_at',
      header: t('Last activity'),
      cell: ({ row }) => (
        <time
          className='whitespace-nowrap'
          dateTime={new Date(row.original.updated_at * 1000).toISOString()}
        >
          {new Date(row.original.updated_at * 1000).toLocaleString(
            i18n.language
          )}
        </time>
      ),
    },
  ]
  const { table } = useDataTable({
    data: query.data?.items ?? [],
    columns,
    getRowId: (row) => String(row.id),
    enableRowSelection: false,
    enableSorting: false,
    manualPagination: true,
    manualFiltering: true,
    totalCount: query.data?.total ?? 0,
    pagination,
    onPaginationChange: setPagination,
    globalFilter: search,
    onGlobalFilterChange: (value) => {
      setSearch(value)
      setPagination((old) => ({ ...old, pageIndex: 0 }))
    },
    columnFilters: filters,
    onColumnFiltersChange: (value) => {
      setFilters(value)
      setPagination((old) => ({ ...old, pageIndex: 0 }))
    },
  })
  const createButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden='true' />
      {t('New ticket')}
    </Button>
  )

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {management ? t('Ticket management') : t('Support tickets')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            size='icon'
            variant='outline'
            aria-label={t('Refresh')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden='true' />
          </Button>
          {!management && createButton}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='flex h-full min-h-0 flex-col gap-3'>
            <Tabs
              value={status}
              onValueChange={(value) => {
                setStatus(String(value))
                setPagination((old) => ({ ...old, pageIndex: 0 }))
              }}
            >
              <TabsList aria-label={t('Ticket status')}>
                <TabsTrigger value='all'>{t('All')}</TabsTrigger>
                {options.status.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {query.isError ? (
              <ErrorState
                title={t('Failed to load tickets')}
                onRetry={() => void query.refetch()}
              />
            ) : (
              <DataTablePage
                table={table}
                columns={columns}
                isLoading={query.isPending}
                isFetching={query.isFetching}
                emptyTitle={t('No tickets')}
                emptyDescription={t('Create a ticket when you need help.')}
                emptyIcon={<MessageCircleQuestion aria-hidden='true' />}
                emptyAction={!management && createButton}
                toolbarProps={{
                  searchPlaceholder: t('Filter by subject...'),
                  searchDebounceMs: 300,
                  filters: [
                    {
                      columnId: 'category',
                      title: t('Category'),
                      options: options.category,
                      singleSelect: true,
                    },
                    {
                      columnId: 'priority',
                      title: t('Priority'),
                      options: options.priority,
                      singleSelect: true,
                    },
                  ],
                }}
              />
            )}
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {creating && (
        <CreateTicketDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSelected(id)
            void client.invalidateQueries({ queryKey: ['tickets'] })
          }}
        />
      )}
      {selected !== null && (
        <TicketDetailDialog
          key={selected}
          id={selected}
          management={management}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
