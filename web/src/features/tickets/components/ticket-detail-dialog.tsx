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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { getTicket, replyTicket, setTicketStatus, type Ticket } from '../api'
import { ticketOptions } from '../options'

export function TicketDetailDialog(props: {
  id: number
  management: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const detail = useQuery({
    queryKey: ['tickets', props.management, props.id, page],
    queryFn: () => getTicket(props.management, props.id, page),
  })
  const schema = z.object({
    content: z
      .string()
      .trim()
      .min(1, t('Message is required'))
      .max(10000, t('Message must be 10,000 characters or fewer')),
  })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { content: '' },
  })
  const reply = useMutation({
    mutationFn: (content: string) =>
      replyTicket(props.management, props.id, content),
    onSuccess: async () => {
      form.reset()
      setPage(1)
      await client.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (error) =>
      handleServerError(error, t('Failed to reply to ticket')),
  })
  const status = useMutation({
    mutationFn: (value: Ticket['status']) =>
      setTicketStatus(props.management, props.id, value),
    onSuccess: () => client.invalidateQueries({ queryKey: ['tickets'] }),
    onError: (error) => handleServerError(error, t('Failed to update ticket')),
  })
  const busy = reply.isPending || status.isPending
  const ticket = detail.data?.ticket
  const options = ticketOptions(t)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose()
      }}
      title={ticket ? `#${ticket.id} · ${ticket.subject}` : t('Ticket details')}
      titleClassName='break-words'
      contentClassName='sm:max-w-3xl'
    >
      {detail.isPending && <LoadingState />}
      {detail.isError && (
        <ErrorState
          title={t('Failed to load ticket')}
          onRetry={() => void detail.refetch()}
        />
      )}
      {!detail.isError && ticket && detail.data && (
        <div className='flex flex-col gap-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge
              variant={ticket.status === 'resolved' ? 'secondary' : 'outline'}
            >
              {
                options.status.find((option) => option.value === ticket.status)
                  ?.label
              }
            </Badge>
            <Badge variant='outline'>
              {
                options.category.find(
                  (option) => option.value === ticket.category
                )?.label
              }
            </Badge>
            <Badge variant='outline'>
              {
                options.priority.find(
                  (option) => option.value === ticket.priority
                )?.label
              }
            </Badge>
            <Button
              className='ms-auto'
              variant='outline'
              disabled={busy}
              onClick={() =>
                status.mutate(ticket.status === 'open' ? 'resolved' : 'open')
              }
            >
              {ticket.status === 'open'
                ? t('Mark as resolved')
                : t('Reopen ticket')}
            </Button>
          </div>
          <article className='bg-muted/40 rounded-lg border p-4'>
            <div className='text-muted-foreground mb-2 flex flex-wrap justify-between gap-2 text-xs'>
              <span>{ticket.username}</span>
              <time dateTime={new Date(ticket.created_at * 1000).toISOString()}>
                {new Date(ticket.created_at * 1000).toLocaleString(
                  i18n.language
                )}
              </time>
            </div>
            <p className='text-sm leading-6 break-words whitespace-pre-wrap'>
              {ticket.content}
            </p>
          </article>
          <ol className='flex flex-col gap-3' aria-label={t('Replies')}>
            {[...detail.data.messages.items].reverse().map((message) => (
              <li key={message.id} className='rounded-lg border p-4'>
                <div className='text-muted-foreground mb-2 flex flex-wrap items-center gap-2 text-xs'>
                  <span>{message.username}</span>
                  {message.is_staff && (
                    <Badge variant='secondary'>{t('Support team')}</Badge>
                  )}
                  <time
                    className='ms-auto'
                    dateTime={new Date(message.created_at * 1000).toISOString()}
                  >
                    {new Date(message.created_at * 1000).toLocaleString(
                      i18n.language
                    )}
                  </time>
                </div>
                <p className='text-sm leading-6 break-words whitespace-pre-wrap'>
                  {message.content}
                </p>
              </li>
            ))}
          </ol>
          {detail.data.messages.total > 50 && (
            <div className='flex flex-wrap justify-between gap-2'>
              <Button
                variant='outline'
                disabled={
                  page * 50 >= detail.data.messages.total || detail.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                {t('Older replies')}
              </Button>
              <Button
                variant='outline'
                disabled={page === 1 || detail.isFetching}
                onClick={() => setPage(page - 1)}
              >
                {t('Newer replies')}
              </Button>
            </div>
          )}
          {ticket.status === 'resolved' ? (
            <p className='text-muted-foreground text-sm'>
              {t('Reopen this ticket before replying')}
            </p>
          ) : (
            <Form {...form}>
              <form
                className='flex flex-col gap-3'
                onSubmit={form.handleSubmit((values) => {
                  if (!busy) reply.mutate(values.content)
                })}
              >
                <FormField
                  control={form.control}
                  name='content'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Reply')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={4}
                          maxLength={10000}
                          disabled={busy}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button className='self-end' type='submit' disabled={busy}>
                  {reply.isPending ? t('Sending...') : t('Send reply')}
                </Button>
              </form>
            </Form>
          )}
        </div>
      )}
    </Dialog>
  )
}
