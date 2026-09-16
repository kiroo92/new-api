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
import type { TFunction } from 'i18next'

export function ticketOptions(t: TFunction) {
  return {
    status: [
      { value: 'open', label: t('Open tickets') },
      { value: 'resolved', label: t('Resolved tickets') },
    ],
    category: [
      { value: 'general', label: t('General inquiry') },
      { value: 'billing', label: t('Billing') },
      { value: 'technical', label: t('Technical support') },
      { value: 'account', label: t('Account') },
    ],
    priority: [
      { value: 'low', label: t('Low') },
      { value: 'normal', label: t('Normal') },
      { value: 'high', label: t('High') },
      { value: 'urgent', label: t('Urgent') },
    ],
  }
}
