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
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { createTicket } from '../api'
import { ticketOptions } from '../options'

export function CreateTicketDialog(props: {
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const { t } = useTranslation()
  const options = ticketOptions(t)
  const schema = z.object({
    subject: z
      .string()
      .trim()
      .min(1, t('Subject is required'))
      .max(120, t('Subject must be 120 characters or fewer')),
    content: z
      .string()
      .trim()
      .min(1, t('Message is required'))
      .max(10000, t('Message must be 10,000 characters or fewer')),
    category: z.enum(['general', 'billing', 'technical', 'account']),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
  })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      subject: '',
      content: '',
      category: 'general',
      priority: 'normal',
    },
  })
  const create = useMutation({
    mutationFn: createTicket,
    onSuccess: (ticket) => props.onCreated(ticket.id),
    onError: (error) => handleServerError(error, t('Failed to create ticket')),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) props.onClose()
      }}
      title={t('New ticket')}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => {
            if (!create.isPending) create.mutate(values)
          })}
          className='flex flex-col gap-4'
        >
          <FormField
            control={form.control}
            name='subject'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Subject')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    maxLength={120}
                    disabled={create.isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='category'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Category')}</FormLabel>
                  <FormControl>
                    <NativeSelect
                      {...field}
                      className='w-full'
                      disabled={create.isPending}
                    >
                      {options.category.map((option) => (
                        <NativeSelectOption
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='priority'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Priority')}</FormLabel>
                  <FormControl>
                    <NativeSelect
                      {...field}
                      className='w-full'
                      disabled={create.isPending}
                    >
                      {options.priority.map((option) => (
                        <NativeSelectOption
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='content'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Message')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={6}
                    maxLength={10000}
                    disabled={create.isPending}
                    placeholder={t(
                      'Describe the issue. Do not include passwords or API keys.'
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={create.isPending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={create.isPending}>
              {create.isPending ? t('Creating...') : t('Create ticket')}
            </Button>
          </div>
        </form>
      </Form>
    </Dialog>
  )
}
