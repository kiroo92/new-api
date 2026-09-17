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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { Tickets } from '..'
import type { Ticket, TicketMessage } from '../api'

const ticket: Ticket = {
  id: 7,
  user_id: 1,
  username: 'customer',
  subject: 'Model request failed',
  content: '<script>alert(1)</script> Please investigate.',
  status: 'open',
  priority: 'high',
  category: 'technical',
  created_at: 1700000000,
  updated_at: 1700000000,
}

function renderTickets(
  management = false,
  items: Ticket[] = [],
  messages: TicketMessage[] = []
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const get = vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    const visible = items.filter(
      (item) => !config?.params?.status || item.status === config.params.status
    )
    const data = String(url).endsWith('/7')
      ? {
          ticket: { ...ticket },
          messages: {
            items: messages,
            total: messages.length,
            page: 1,
            page_size: 50,
          },
        }
      : { items: visible, total: visible.length, page: 1, page_size: 20 }
    return { data: { success: true, data } }
  })
  render(
    <QueryClientProvider client={client}>
      <Tickets management={management} />
    </QueryClientProvider>
  )
  return { get, client, user: userEvent.setup() }
}

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  ticket.status = 'open'
  localStorage.clear()
  await i18next.changeLanguage('en')
})

it.each([
  { language: 'zhCN', locale: 'zh-CN', management: true },
  { language: 'zhTW', locale: 'zh-TW', management: true },
  { language: 'zhCN', locale: 'zh-CN', management: false },
  { language: 'zhTW', locale: 'zh-TW', management: false },
])(
  'renders ticket list, detail and reply dates in $language (management=$management)',
  async ({ language, locale, management }) => {
    await i18next.changeLanguage(language)
    const message: TicketMessage = {
      id: 11,
      username: 'support',
      is_staff: true,
      content: 'We have received your ticket.',
      created_at: ticket.created_at + 3600,
    }
    const { user } = renderTickets(management, [ticket], [message])
    const subject = await screen.findByRole('button', { name: ticket.subject })
    expect(
      screen.getByText(
        new Date(ticket.updated_at * 1000).toLocaleString(locale),
        { collapseWhitespace: false }
      )
    ).toBeVisible()

    await user.click(subject)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(ticket.content ?? '')).toBeVisible()
    expect(
      within(dialog).getByText(
        new Date(ticket.created_at * 1000).toLocaleString(locale),
        { collapseWhitespace: false }
      )
    ).toBeVisible()
    const replies = within(dialog).getByRole('list', { name: 'Replies' })
    expect(within(replies).getByText(message.content)).toBeVisible()
    expect(
      within(replies).getByText(
        new Date(message.created_at * 1000).toLocaleString(locale),
        { collapseWhitespace: false }
      )
    ).toBeVisible()
  }
)

it('opens the create dialog from the empty state and blocks empty or duplicate submissions', async () => {
  let finish!: (value: { data: { success: boolean; data: Ticket } }) => void
  const post = vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const { user } = renderTickets()
  await screen.findByText('No tickets')
  await user.click(screen.getAllByRole('button', { name: 'New ticket' })[0])
  const dialog = await screen.findByRole('dialog')
  await user.click(
    within(dialog).getByRole('button', { name: 'Create ticket' })
  )
  expect(await within(dialog).findByText('Subject is required')).toBeVisible()
  expect(post).not.toHaveBeenCalled()
  await user.type(
    within(dialog).getByLabelText('Subject'),
    'Model request failed'
  )
  await user.type(
    within(dialog).getByLabelText('Message'),
    'Please investigate.'
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Create ticket' })
  )
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  expect(
    within(dialog).getByRole('button', { name: 'Creating...' })
  ).toBeDisabled()
  finish({ data: { success: true, data: ticket } })
  await screen.findByText(ticket.content ?? '')
  expect(screen.getByRole('button', { name: 'Send reply' })).toBeVisible()
  expect(document.querySelector('script')).toBeNull()
})

it('preserves the draft when creation fails so the user can retry', async () => {
  vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
  const { user } = renderTickets()
  await screen.findByText('No tickets')
  await user.click(screen.getAllByRole('button', { name: 'New ticket' })[0])
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText('Subject'), 'Keep my subject')
  await user.type(within(dialog).getByLabelText('Message'), 'Keep my message')
  await user.click(
    within(dialog).getByRole('button', { name: 'Create ticket' })
  )
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Create ticket' })
    ).toBeEnabled()
  )
  expect(within(dialog).getByLabelText('Message')).toHaveValue(
    'Keep my message'
  )
})

it('uses management endpoints and requires reopening before a reply', async () => {
  ticket.status = 'resolved'
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const patch = vi.spyOn(api, 'patch').mockImplementation(async () => {
    ticket.status = 'open'
    return { data: { success: true } }
  })
  const { user, get } = renderTickets(true, [ticket])
  await user.click(await screen.findByRole('button', { name: ticket.subject }))
  await screen.findByText('Reopen this ticket before replying')
  expect(
    screen.queryByRole('button', { name: 'Send reply' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reopen ticket' }))
  await screen.findByRole('button', { name: 'Send reply' })
  expect(patch).toHaveBeenCalledWith('/api/ticket-management/7', {
    status: 'open',
  })
  expect(get).toHaveBeenCalledWith('/api/ticket-management/7', {
    params: { p: 1, page_size: 50 },
  })
  await user.type(screen.getByLabelText('Reply'), 'We are investigating.')
  await user.click(screen.getByRole('button', { name: 'Send reply' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/ticket-management/7/messages', {
      content: 'We are investigating.',
    })
  )
  await waitFor(() => expect(screen.getByLabelText('Reply')).toHaveValue(''))
})

it('filters the list by status and exposes a retry when loading fails', async () => {
  const { user, get } = renderTickets(false, [ticket])
  await screen.findByRole('button', { name: ticket.subject })
  await user.click(screen.getByRole('tab', { name: 'Resolved tickets' }))
  await screen.findByText('No tickets')
  expect(screen.getByRole('tab', { name: 'Resolved tickets' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  get.mockRejectedValue(new Error('offline'))
  await user.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Failed to load tickets')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
})

it('keeps ticket actions and content available in the mobile card layout', async () => {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches:
      query.includes('max-width') || query.includes('prefers-reduced-motion'),
  }))
  const { user } = renderTickets(false, [ticket])
  await user.click(await screen.findByRole('button', { name: ticket.subject }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(ticket.content ?? '')).toBeVisible()
  fireEvent.change(within(dialog).getByLabelText('Reply'), {
    target: { value: 'Follow-up' },
  })
  expect(
    within(dialog).getByRole('button', { name: 'Send reply' })
  ).toBeEnabled()
})
