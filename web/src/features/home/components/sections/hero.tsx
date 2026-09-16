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
import {
  Anthropic,
  CherryStudio,
  DeepSeek,
  Gemini,
  OpenAI,
  Qwen,
} from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { Stats } from './stats'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

const providers = [
  { name: 'DeepSeek', icon: DeepSeek, route: '/v1/chat/completions' },
  { name: 'OpenAI', icon: OpenAI, route: '/v1/responses' },
  { name: 'Anthropic', icon: Anthropic, route: '/v1/messages' },
  {
    name: 'Gemini',
    icon: Gemini,
    route: '/v1beta/models/{model}:generateContent',
  },
  { name: 'Qwen', icon: Qwen, route: '/v1/chat/completions' },
]

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'

  return (
    <section
      className={cn(
        'home-hero border-border border-b px-6 pt-32 pb-12 lg:pt-40 lg:pb-16',
        props.className
      )}
    >
      <div className='mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10'>
        <div className='min-w-0'>
          <h1 className='landing-animate-fade-up max-w-xl font-serif text-[clamp(2.75rem,5vw,4.5rem)] leading-[1.08] font-medium tracking-[-0.045em] text-balance [animation-delay:80ms]'>
            {t('Full-power Claude API')}
          </h1>
          <p className='landing-animate-fade-up text-brand mt-5 font-serif text-2xl leading-snug text-balance [animation-delay:120ms] sm:text-3xl'>
            {t('Stable and ready to use')}
          </p>
          <p className='landing-animate-fade-up text-muted-foreground mt-7 max-w-lg text-base leading-7 text-pretty [animation-delay:160ms]'>
            {t(
              'Same models and capabilities as the official API, without degradation. Global direct access and pay-as-you-go pricing.'
            )}
          </p>
          <div className='landing-animate-fade-up mt-9 flex flex-wrap gap-3 [animation-delay:240ms]'>
            <Button
              className='home-primary-action h-11 px-5'
              render={
                <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
              }
            >
              {props.isAuthenticated
                ? t('Go to Dashboard')
                : t('Start for free')}
              <ArrowRight aria-hidden='true' className='size-4' />
            </Button>
            <Button
              variant='outline'
              className='h-11 px-5'
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
            <Button
              variant='ghost'
              className='h-11 px-4'
              render={
                docsUrl.startsWith('http') ? (
                  <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
                ) : (
                  <Link to={docsUrl} />
                )
              }
            >
              <BookOpen aria-hidden='true' className='size-4' />
              {t('Docs')}
            </Button>
          </div>
          <Stats />
        </div>

        <figure
          className='home-routing min-w-0'
          aria-label={t('Multi-protocol Compatible')}
        >
          <svg
            className='home-routing-lines'
            aria-hidden='true'
            viewBox='0 0 680 430'
            fill='none'
            preserveAspectRatio='none'
          >
            <g className='home-contours'>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((line) => (
                <path
                  key={line}
                  transform={`translate(0 ${line * 11})`}
                  d='M25 365C120 345 160 390 228 300S310 195 380 260 470 340 655 285'
                />
              ))}
            </g>
            <path className='home-route-flow' d='M218 215H330' />
            {[39, 127, 215, 303, 391].map((y) => (
              <path
                key={y}
                className='home-route-flow home-route-branch'
                d={`M330 215C390 215 386 ${y} 449 ${y}`}
              />
            ))}
            <circle className='home-route-halo' cx='330' cy='215' r='24' />
            <circle className='home-route-node' cx='330' cy='215' r='10' />
          </svg>
          <div className='home-request border-border bg-card relative rounded-xl border p-5 shadow-sm'>
            <p className='text-primary mb-3 text-[10px] font-semibold tracking-[0.16em] uppercase'>
              {t('Request')}
            </p>
            <pre className='text-foreground overflow-x-auto font-mono text-[11px] leading-6'>
              {
                'POST /v1/chat/completions\n{\n  "model": "your-model",\n  "messages": [...]\n}'
              }
            </pre>
          </div>
          <div className='home-routing-label text-muted-foreground text-center text-[10px] tracking-wider'>
            {t('Load Balancing')}
          </div>
          <ul className='home-providers grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1'>
            {providers.map((provider) => (
              <li
                key={provider.name}
                className='home-provider border-border bg-card min-w-0 rounded-xl border px-4 py-3 shadow-sm'
              >
                <div className='flex items-center gap-2.5'>
                  <provider.icon size={21} aria-hidden='true' />
                  <span className='text-sm font-semibold'>{provider.name}</span>
                </div>
                <code
                  className='text-muted-foreground mt-2 block truncate text-[9px]'
                  title={provider.route}
                >
                  {provider.route}
                </code>
              </li>
            ))}
          </ul>
        </figure>
      </div>
      <div className='border-border mx-auto mt-14 flex max-w-7xl flex-col gap-5 border-t pt-7 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-muted-foreground text-xs font-medium'>
            {t('Supported Applications')}
          </p>
          <p className='text-muted-foreground mt-1 max-w-xl text-xs leading-relaxed'>
            {t(
              'Supports one-click configuration and perfectly adapts to NewAPI multi-protocol configuration.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-6 text-sm'>
          <a
            href='https://cherry-ai.com'
            target='_blank'
            rel='noopener noreferrer'
            className='hover:text-primary inline-flex items-center gap-2 transition-colors'
          >
            <CherryStudio.Color size={22} aria-hidden='true' /> Cherry Studio
          </a>
          <a
            href='https://ccswitch.io'
            target='_blank'
            rel='noopener noreferrer'
            className='hover:text-primary inline-flex items-center gap-2 transition-colors'
          >
            <span
              aria-hidden='true'
              className='bg-muted rounded-md px-1.5 py-1 font-mono text-xs'
            >
              CC
            </span>{' '}
            CC Switch
          </a>
          <span className='text-muted-foreground text-xs'>
            {t('More Apps')}
          </span>
        </div>
      </div>
    </section>
  )
}
