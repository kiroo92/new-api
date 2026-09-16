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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface Ticket {
  id: number
  user_id: number
  username: string
  subject: string
  content?: string
  status: 'open' | 'resolved'
  category: string
  priority: string
  created_at: number
  updated_at: number
}
export interface TicketMessage {
  id: number
  username: string
  is_staff: boolean
  content: string
  created_at: number
}
export interface TicketPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
export interface TicketDetail {
  ticket: Ticket
  messages: TicketPage<TicketMessage>
}
export interface NewTicket {
  subject: string
  content: string
  category: string
  priority: string
}

export async function getTickets(
  management: boolean,
  params: Record<string, string | number>
): Promise<TicketPage<Ticket>> {
  const response = await api.get(
    management ? '/api/ticket-management' : '/api/tickets',
    { params }
  )
  return requireServerSuccess(response.data).data
}
export async function getTicket(
  management: boolean,
  id: number,
  page: number
): Promise<TicketDetail> {
  const response = await api.get(
    `${management ? '/api/ticket-management' : '/api/tickets'}/${id}`,
    { params: { p: page, page_size: 50 } }
  )
  return requireServerSuccess(response.data).data
}
export async function createTicket(input: NewTicket): Promise<Ticket> {
  const response = await api.post('/api/tickets', input)
  return requireServerSuccess(response.data).data
}
export async function replyTicket(
  management: boolean,
  id: number,
  content: string
): Promise<void> {
  const response = await api.post(
    `${management ? '/api/ticket-management' : '/api/tickets'}/${id}/messages`,
    { content }
  )
  requireServerSuccess(response.data)
}
export async function setTicketStatus(
  management: boolean,
  id: number,
  status: Ticket['status']
): Promise<void> {
  const response = await api.patch(
    `${management ? '/api/ticket-management' : '/api/tickets'}/${id}`,
    { status }
  )
  requireServerSuccess(response.data)
}
