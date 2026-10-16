<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t('settings.cloudSave.title') }}</CardTitle>
      <CardDescription>{{ t('settings.cloudSave.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p class="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 font-semibold text-amber-700 dark:text-amber-400" role="note">
        {{ t('settings.cloudSave.securityWarning') }}
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <Label for="cloud-save-username">{{ t('settings.cloudSave.username') }}</Label>
          <input
            id="cloud-save-username"
            v-model="username"
            type="text"
            minlength="3"
            maxlength="20"
            autocomplete="off"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="busy !== null"
            aria-describedby="cloud-save-username-hint"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <p id="cloud-save-username-hint" class="text-xs text-muted-foreground">{{ t('settings.cloudSave.usernameHint') }}</p>
        </div>
        <div class="space-y-2">
          <Label for="cloud-save-password">{{ t('settings.cloudSave.password') }}</Label>
          <input
            id="cloud-save-password"
            v-model="password"
            type="password"
            minlength="8"
            autocomplete="new-password"
            :disabled="busy !== null"
            aria-describedby="cloud-save-password-hint"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <p id="cloud-save-password-hint" class="text-xs text-muted-foreground">{{ t('settings.cloudSave.passwordTooShort') }}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button :disabled="!credentialsReady || busy !== null || status.retryAfter > 0 || status.remainingToday === 0" @click="handleUpload">
          <CloudUpload class="mr-2 h-4 w-4" />
          {{ t(busy === 'upload' ? 'settings.cloudSave.uploading' : 'settings.cloudSave.upload') }}
        </Button>
        <Button variant="outline" :disabled="!credentialsReady || busy !== null" @click="showDownloadConfirm = true">
          <CloudDownload class="mr-2 h-4 w-4" />
          {{ t(busy === 'download' ? 'settings.cloudSave.downloading' : 'settings.cloudSave.download') }}
        </Button>
      </div>
      <div class="space-y-1 text-sm text-muted-foreground" role="status">
        <p>{{ t('settings.cloudSave.lastSync', { time: lastSyncTime }) }}</p>
        <p>{{ t('settings.cloudSave.remaining', { count: status.remainingToday }) }}</p>
        <p>{{ status.retryAfter > 0 ? t('settings.cloudSave.countdown', { time: formatCountdown(status.retryAfter) }) : t('settings.cloudSave.ready') }}</p>
      </div>
      <details class="rounded-lg border p-3">
        <summary class="cursor-pointer text-sm font-medium">{{ t('settings.cloudSave.advanced') }}</summary>
        <div class="mt-3 space-y-2">
          <Label for="cloud-save-worker-url">{{ t('settings.cloudSave.workerUrl') }}</Label>
          <input
            id="cloud-save-worker-url"
            v-model="workerUrl"
            type="url"
            :placeholder="DEFAULT_CLOUD_SAVE_URL"
            :disabled="busy !== null"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            @change="saveWorkerUrl"
          />
        </div>
      </details>
    </CardContent>
  </Card>
  <AlertDialog v-model:open="showDownloadConfirm">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('settings.cloudSave.downloadConfirmTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('settings.cloudSave.downloadConfirmMessage') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="handleDownload">{{ t('settings.cloudSave.download') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { CloudDownload, CloudUpload } from 'lucide-vue-next'
  import { toast } from 'vue-sonner'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Button } from '@/components/ui/button'
  import { Label } from '@/components/ui/label'
  import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
  } from '@/components/ui/alert-dialog'
  import { useI18n } from '@/composables/useI18n'
  import { useGameStore } from '@/stores/gameStore'
  import {
    CloudSaveError, DEFAULT_CLOUD_SAVE_URL, downloadCloudSave,
    getCloudSaveStatus, isValidCloudUsername, loadCloudSaveWorkerUrl,
    saveCloudSaveWorkerUrl, uploadCloudSave
  } from '@/logic/cloudSaveLogic'

  const { t, locale } = useI18n()
  const gameStore = useGameStore()
  const username = ref('')
  const password = ref('')
  const workerUrl = ref(loadCloudSaveWorkerUrl())
  const busy = ref<'upload' | 'download' | null>(null)
  const showDownloadConfirm = ref(false)
  const now = ref(Date.now())
  const credentialsReady = computed(() => isValidCloudUsername(username.value) && password.value.length >= 8)
  const status = computed(() => getCloudSaveStatus(username.value, workerUrl.value, now.value))
  const lastSyncTime = computed(() => status.value.lastSyncAt
    ? new Date(status.value.lastSyncAt).toLocaleString(locale.value)
    : t('settings.cloudSave.never'))
  const credentials = () => ({ username: username.value, password: password.value, workerUrl: workerUrl.value })
  const formatCountdown = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  const showError = (error: unknown) => {
    if (error instanceof CloudSaveError) {
      toast.error(t(`settings.cloudSave.${error.code}`, {
        time: formatCountdown(error.retryAfter), count: error.remainingToday
      }))
    } else {
      toast.error(t('settings.cloudSave.requestFailed'))
    }
  }

  const saveWorkerUrl = () => {
    try {
      workerUrl.value = saveCloudSaveWorkerUrl(workerUrl.value)
    } catch (error) {
      showError(error)
    }
  }

  const handleUpload = async () => {
    if (busy.value !== null) return
    busy.value = 'upload'
    try {
      const result = await uploadCloudSave(credentials())
      toast[result === 'unchanged' ? 'info' : 'success'](t(`settings.cloudSave.${result}`))
    } catch (error) {
      showError(error)
    } finally {
      now.value = Date.now()
      busy.value = null
    }
  }

  const handleDownload = async () => {
    if (busy.value !== null) return
    busy.value = 'download'
    try {
      await downloadCloudSave(credentials(), gameStore)
      password.value = ''
    } catch (error) {
      showError(error)
    } finally {
      now.value = Date.now()
      busy.value = null
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => { now.value = Date.now() }, 1000)
  })
  onUnmounted(() => {
    clearInterval(timer)
    password.value = ''
  })
</script>
