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
import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'

import { regenerateApiKey } from '../api'
import { ERROR_MESSAGES } from '../constants'
import { useApiKeys } from './api-keys-provider'

export function ApiKeysPrimaryButtons() {
  const { t } = useTranslation()
  const { triggerRefresh } = useApiKeys()
  const [open, setOpen] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const verification = useSecureVerification()

  const handleRegenerate = async () => {
    if (isRegenerating || verification.isActive) return
    setOpen(false)
    setIsRegenerating(true)
    try {
      const proof = await verification.requestVerification({
        scope: 'api_key.regenerate',
      })
      if (!proof) return
      const result = await regenerateApiKey(proof.proof_token)
      if (!result.success) {
        handleServerError(result, t(ERROR_MESSAGES.UNEXPECTED))
        return
      }
      toast.success(t('API Key regenerated successfully'))
      setOpen(false)
      triggerRefresh()
    } catch (error) {
      handleServerError(error, t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className='flex gap-2'>
      <Button
        size='sm'
        variant='outline'
        disabled={isRegenerating || verification.isActive}
        onClick={() => setOpen(true)}
      >
        {isRegenerating ? (
          <Loader2 className='size-4 animate-spin' />
        ) : (
          <KeyRound className='size-4' />
        )}
        {t('Regenerate API Key')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('Regenerate API Key?')}
        desc={t('The current API key will stop working immediately.')}
        confirmText={t('Regenerate')}
        destructive
        isLoading={isRegenerating || verification.isActive}
        handleConfirm={() => void handleRegenerate()}
      />
      <SecureVerificationDialog {...verification.dialogProps} />
    </div>
  )
}
