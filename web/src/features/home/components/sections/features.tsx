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
  Zap,
  Shield,
  Globe,
  Code,
  Gauge,
  DollarSign,
  Users,
  HeartHandshake,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

export function Features() {
  const { t } = useTranslation()
  const features = [
    {
      icon: Zap,
      title: t('Lightning Fast'),
      desc: t(
        'Optimized network architecture ensures millisecond response times'
      ),
    },
    {
      icon: Shield,
      title: t('Secure & Reliable'),
      desc: t(
        'Enterprise-grade security with comprehensive permission management'
      ),
    },
    {
      icon: Globe,
      title: t('Global Coverage'),
      desc: t('Multi-region deployment for stable global access'),
    },
    {
      icon: Code,
      title: t('Developer Friendly'),
      desc: t('Compatible API routes for common AI application workflows'),
    },
  ]
  const additionalFeatures = [
    {
      icon: Gauge,
      title: t('High Performance'),
      desc: t('Support for high concurrency with automatic load balancing'),
    },
    {
      icon: DollarSign,
      title: t('Transparent Billing'),
      desc: t('Pay-as-you-go with real-time usage monitoring'),
    },
    {
      icon: Users,
      title: t('Team Collaboration'),
      desc: t('Multi-user management with flexible permission allocation'),
    },
    {
      icon: HeartHandshake,
      title: t('Open Source'),
      desc: t('Community driven, self-hosted, and extensible'),
    },
  ]

  return (
    <section className='px-6 py-16 md:py-24'>
      <div className='mx-auto max-w-7xl'>
        <AnimateInView className='mb-10 max-w-2xl'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t('Core Features')}
          </p>
          <h2 className='font-serif text-3xl leading-tight font-medium tracking-tight md:text-4xl'>
            {t('Built for developers,')}
            <br />
            {t('designed for scale')}
          </h2>
        </AnimateInView>
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
          {features.map((feature, i) => (
            <AnimateInView
              key={feature.title}
              delay={i * 80}
              className='border-border bg-card overflow-hidden rounded-xl border'
            >
              <div
                aria-hidden='true'
                className='bg-secondary flex h-28 items-center justify-center bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:14px_14px]'
              >
                <feature.icon className='size-9' strokeWidth={1.3} />
              </div>
              <div className='p-6'>
                <h3 className='text-base font-semibold'>{feature.title}</h3>
                <p className='text-muted-foreground mt-3 text-sm leading-6'>
                  {feature.desc}
                </p>
              </div>
            </AnimateInView>
          ))}
        </div>
        <div className='mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4'>
          {additionalFeatures.map((feature) => (
            <div key={feature.title} className='flex items-start gap-3'>
              <feature.icon
                aria-hidden='true'
                className='text-primary mt-0.5 size-5 shrink-0'
                strokeWidth={1.5}
              />
              <div>
                <h3 className='text-sm font-semibold'>{feature.title}</h3>
                <p className='text-muted-foreground mt-2 text-xs leading-5'>
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
