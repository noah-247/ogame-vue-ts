<template>
  <div class="container mx-auto p-4 sm:p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ t('nav.settings') }}</h1>
    </div>

    <!-- 資料管理 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('settings.dataManagement') }}</CardTitle>
        <CardDescription>{{ t('settings.dataManagementDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 匯出資料 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.exportData') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.exportDataDesc') }}</p>
          </div>
          <Button @click="handleExport" :disabled="isExporting">
            <Download class="mr-2 h-4 w-4" />
            {{ isExporting ? t('settings.exporting') : t('settings.export') }}
          </Button>
        </div>

        <!-- 匯入資料 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.importData') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.importDataDesc') }}</p>
          </div>
          <div class="flex gap-2">
            <input ref="fileInputRef" type="file" accept=".json,application/json,text/plain" class="hidden" @change="handleFileSelect" />
            <Button @click="triggerFileInput" variant="outline">
              <Upload class="mr-2 h-4 w-4" />
              {{ t('settings.selectFile') }}
            </Button>
          </div>
        </div>

        <!-- WebDAV 雲同步 -->
        <div class="flex flex-col gap-3 p-4 border rounded-lg border-blue-500/30 bg-blue-500/5">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <h3 class="font-medium flex items-center gap-2">
                <Cloud class="h-4 w-4 text-blue-500" />
                {{ t('settings.webdav.title') }}
              </h3>
              <p class="text-sm text-muted-foreground">{{ t('settings.webdav.desc') }}</p>
            </div>
            <Button @click="showWebDAVConfig = true" variant="outline" size="sm">
              <Settings2 class="mr-2 h-4 w-4" />
              {{ t('settings.webdav.config') }}
            </Button>
          </div>
          <div v-if="webdavConfig" class="flex gap-2 pt-2 border-t">
            <Button @click="handleWebDAVUpload" :disabled="isWebDAVUploading" class="flex-1" variant="outline">
              <CloudUpload class="mr-2 h-4 w-4" />
              {{ isWebDAVUploading ? t('settings.webdav.uploading') : t('settings.webdav.upload') }}
            </Button>
            <Button @click="showWebDAVFiles = true" class="flex-1" variant="outline">
              <CloudDownload class="mr-2 h-4 w-4" />
              {{ t('settings.webdav.download') }}
            </Button>
          </div>
          <p v-else class="text-xs text-muted-foreground">{{ t('settings.webdav.notConfigured') }}</p>
        </div>

        <!-- 清除資料 -->
        <div class="flex items-center justify-between p-4 border rounded-lg border-destructive/50">
          <div class="space-y-1">
            <h3 class="font-medium text-destructive">{{ t('settings.clearData') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.clearDataDesc') }}</p>
          </div>
          <Button @click="handleClearData" variant="destructive">
            <Trash2 class="mr-2 h-4 w-4" />
            {{ t('settings.clear') }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <CloudSaveSettings />

    <!-- 遊戲設定 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('settings.gameSettings') }}</CardTitle>
        <CardDescription>{{ t('settings.gameSettingsDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 遊戲倍率 -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-3">
          <div class="space-y-1 flex-1">
            <h3 class="font-medium">{{ t('settings.gameSpeed') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.gameSpeedDesc') }}</p>
          </div>
          <div class="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div class="flex items-center gap-2 flex-1 sm:flex-initial">
              <Button @click="decreaseSpeed" variant="outline" size="sm" :disabled="gameStore.gameSpeed <= 0.5">-</Button>
              <span class="min-w-[60px] text-center font-medium">{{ gameStore.gameSpeed }}x</span>
              <Button @click="increaseSpeed" variant="outline" size="sm" :disabled="gameStore.gameSpeed >= 100">+</Button>
            </div>
            <Button @click="resetSpeed" variant="ghost" size="sm">{{ t('settings.reset') }}</Button>
          </div>
        </div>

        <!-- 遊戲暫停 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.gamePause') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.gamePauseDesc') }}</p>
          </div>
          <Button @click="togglePause" :variant="gameStore.isPaused ? 'default' : 'outline'">
            <component :is="gameStore.isPaused ? Play : Pause" class="mr-2 h-4 w-4" />
            {{ gameStore.isPaused ? t('settings.resume') : t('settings.pause') }}
          </Button>
        </div>

        <!-- 戰鬥模式 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.battleMode') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.battleModeDesc') }}</p>
          </div>
          <Switch :checked="gameStore.battleToFinish" @update:checked="(val: boolean) => (gameStore.battleToFinish = val)" />
        </div>

        <!-- 玩家名稱 -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-3">
          <div class="space-y-1 flex-1">
            <h3 class="font-medium">{{ t('settings.playerName') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.playerNameDesc') }}</p>
          </div>
          <Input
            :model-value="gameStore.player.name"
            @update:model-value="(val: string | number) => { gameStore.player.name = String(val).slice(0, 24) }"
            @blur="normalizePlayerName"
            class="w-full sm:w-64"
            maxlength="24"
            :placeholder="t('settings.playerName')"
          />
        </div>

        <!-- NPC 名稱語言 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.npcNameEnglish') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.npcNameEnglishDesc') }}</p>
          </div>
          <Switch :checked="gameStore.npcNameLocale === 'en'" @update:checked="toggleNpcNameLocale" />
        </div>
      </CardContent>
    </Card>

    <!-- 通知設定 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('settings.notifications') }}</CardTitle>
        <CardDescription>{{ t('settings.notificationsDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 瀏覽器通知 -->
        <div class="flex flex-col gap-4 p-4 border rounded-lg" v-if="!Capacitor.isNativePlatform()">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <h3 class="font-medium">{{ t('settings.browserNotifications') }}</h3>
              <p class="text-sm text-muted-foreground">{{ t('settings.browserPermission') }}</p>
            </div>
            <Switch :checked="gameStore.notificationSettings?.browser" @update:checked="handleBrowserSwitch" />
          </div>

          <!-- 頁面聚焦時不傳送 -->
          <div
            class="flex items-center justify-between pl-4 border-l-2"
            :class="{ 'opacity-50 pointer-events-none': !gameStore.notificationSettings?.browser }"
          >
            <Label class="font-normal">{{ t('settings.suppressInFocus') }}</Label>
            <Switch
              :checked="gameStore.notificationSettings?.suppressInFocus"
              @update:checked="updateSuppressSetting"
              :disabled="!gameStore.notificationSettings?.browser"
            />
          </div>
        </div>

        <!-- 頁面內通知 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.inAppNotifications') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.inAppNotificationsDesc') || t('settings.inAppNotifications') }}</p>
          </div>
          <Switch :checked="gameStore.notificationSettings?.inApp" @update:checked="(val: boolean) => updateInAppSetting(val)" />
        </div>

        <!-- 具體通知型別 -->
        <div class="border rounded-lg overflow-hidden" :class="{ 'opacity-50 pointer-events-none': areMainSwitchesOff }">
          <div
            class="flex items-center justify-between p-4 bg-muted/50 cursor-pointer select-none"
            @click="!areMainSwitchesOff && (isTypesExpanded = !isTypesExpanded)"
          >
            <div class="space-y-1">
              <h3 class="font-medium">{{ t('settings.notificationTypes') }}</h3>
              <p class="text-sm text-muted-foreground">
                {{
                  areMainSwitchesOff
                    ? t('settings.notificationsDisabled')
                    : isTypesExpanded
                      ? t('settings.collapseTypes')
                      : t('settings.expandTypes')
                }}
              </p>
            </div>
            <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
              <component :is="isTypesExpanded ? ChevronUp : ChevronDown" class="h-4 w-4" />
            </Button>
          </div>

          <div v-if="isTypesExpanded && !areMainSwitchesOff" class="p-4 space-y-4 border-t bg-card">
            <!-- 建造完成 -->
            <div class="flex items-center justify-between">
              <Label class="font-normal cursor-pointer" @click="toggleType('construction')">{{ t('settings.constructionComplete') }}</Label>
              <Switch
                :checked="gameStore.notificationSettings?.types.construction"
                @update:checked="(val: boolean) => updateTypeSetting('construction', val)"
              />
            </div>
            <!-- 研究完成 -->
            <div class="flex items-center justify-between">
              <Label class="font-normal cursor-pointer" @click="toggleType('research')">{{ t('settings.researchComplete') }}</Label>
              <Switch
                :checked="gameStore.notificationSettings?.types.research"
                @update:checked="(val: boolean) => updateTypeSetting('research', val)"
              />
            </div>
            <!-- 解鎖通知 -->
            <div class="flex items-center justify-between">
              <Label class="font-normal cursor-pointer" @click="toggleType('unlock')">{{ t('settings.unlockNotification') }}</Label>
              <Switch
                :checked="gameStore.notificationSettings?.types.unlock"
                @update:checked="(val: boolean) => updateTypeSetting('unlock', val)"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 幫助提示設定 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('hints.hintsEnabled') }}</CardTitle>
        <CardDescription>{{ t('hints.hintsEnabledDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 啟用/禁用提示 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('hints.hintsEnabled') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('hints.hintsEnabledDesc') }}</p>
          </div>
          <Switch :checked="hintsEnabled" @update:checked="setHintsEnabled" />
        </div>

        <!-- 重置提示 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('hints.resetHints') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('hints.resetHintsDesc') }}</p>
          </div>
          <Button @click="handleResetHints" variant="outline">
            <RotateCcw class="mr-2 h-4 w-4" />
            {{ t('settings.reset') }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 顯示設定 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('settings.displaySettings') }}</CardTitle>
        <CardDescription>{{ t('settings.displaySettingsDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 背景動畫 -->
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div class="space-y-1">
            <h3 class="font-medium">{{ t('settings.backgroundAnimation') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.backgroundAnimationDesc') }}</p>
          </div>
          <Switch :checked="gameStore.player.backgroundEnabled ?? false" @update:checked="updateBackgroundSetting" />
        </div>
      </CardContent>
    </Card>

    <!-- 關於 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('settings.about') }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">{{ t('settings.version') }}:</span>
            <span class="font-medium">{{ pkg.version }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">{{ t('settings.buildDate') }}:</span>
            <span class="font-medium">{{ pkg.buildDate }}</span>
          </div>
          <!-- 檢查更新按鈕 -->
          <div class="pt-2">
            <Button @click="handleCheckVersion" variant="outline" size="sm" :disabled="isCheckingVersion || !canCheck" class="w-full">
              <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isCheckingVersion }" />
              <template v-if="isCheckingVersion">{{ t('settings.checking') }}</template>
              <template v-else-if="!canCheck && cooldownTime">{{ cooldownTime }}</template>
              <template v-else>{{ t('settings.checkUpdate') }}</template>
            </Button>
          </div>
        </div>

        <!-- 社群連結 -->
        <div class="pt-2 border-t space-y-2">
          <h3 class="text-sm font-medium">{{ t('settings.community') }}</h3>
          <div class="flex flex-col gap-2">
            <!-- Privacy Policy -->
            <Button variant="outline" class="w-full justify-start" @click="openPrivacy">
              <Shield class="mr-2 h-4 w-4" />
              {{ t('settings.privacyPolicy') }}
            </Button>
            <!-- GitHub -->
            <Button variant="outline" class="w-full justify-start" @click="openGithub">
              <ExternalLink class="mr-2 h-4 w-4" />
              {{ t('settings.github') }}
            </Button>
            <Button
              v-if="gameStore.locale === 'zh-CN' || gameStore.locale === 'zh-TW'"
              variant="outline"
              class="w-full justify-start"
              @click="openQQGroup"
            >
              <MessagesSquare class="mr-2 h-4 w-4" />
              {{ t('settings.qqGroup') }}
              <span class="ml-auto text-xs text-muted-foreground">{{ pkg.qq }}</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 確認對話方塊 -->
    <AlertDialog :open="showConfirmDialog" @update:open="showConfirmDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ confirmTitle }}</AlertDialogTitle>
          <AlertDialogDescription>{{ confirmMessage }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="cancelAction">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmAction">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 更新對話方塊 -->
    <UpdateDialog v-model:open="showUpdateDialog" :version-info="updateInfo" />

    <!-- 隱私協議彈窗 -->
    <PrivacyDialog v-model:open="showPrivacyDialog" />

    <!-- WebDAV 配置對話方塊 -->
    <WebDAVConfigDialog v-model:open="showWebDAVConfig" />

    <!-- WebDAV 檔案列表對話方塊 -->
    <WebDAVFileListDialog v-model:open="showWebDAVFiles" :config="webdavConfig" @select="handleWebDAVDownload" />
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { useGameStore } from '@/stores/gameStore'
  import { useI18n } from '@/composables/useI18n'
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
  import { Button } from '@/components/ui/button'
  import { Switch } from '@/components/ui/switch'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
  } from '@/components/ui/alert-dialog'
  import {
    Download,
    Upload,
    Trash2,
    ExternalLink,
    MessagesSquare,
    Play,
    Pause,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    RotateCcw,
    Shield,
    Cloud,
    CloudUpload,
    CloudDownload,
    Settings2
  } from 'lucide-vue-next'
  import { saveAs } from 'file-saver'
  import { toast } from 'vue-sonner'
  import { Capacitor } from '@capacitor/core'
  import { decryptData, encryptData } from '@/utils/crypto'
  import { parseSave } from '@/logic/saveIo'
  import { validateSaveImportBundle } from '@/logic/saveMigration'
  import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
  import pkg from '../../package.json'
  import { checkLatestVersion, canCheckVersion } from '@/utils/versionCheck'
  import type { VersionInfo } from '@/utils/versionCheck'
  import type { NPC } from '@/types/game'
  import UpdateDialog from '@/components/dialogs/UpdateDialog.vue'
  import PrivacyDialog from '@/components/dialogs/PrivacyDialog.vue'
  import WebDAVConfigDialog from '@/components/settings/WebDAVConfigDialog.vue'
  import WebDAVFileListDialog from '@/components/settings/WebDAVFileListDialog.vue'
  import CloudSaveSettings from '@/components/settings/CloudSaveSettings.vue'
  import { useHints } from '@/composables/useHints'
  import { uploadToWebDAV, downloadFromWebDAV } from '@/services/webdavService'
  import { useNPCStore } from '@/stores/npcStore'
  import { updateNPCName, resolveNPCNameLocale } from '@/logic/npcNameGenerator'

  const { t } = useI18n()
  const { hintsEnabled, setHintsEnabled, resetHints } = useHints()
  const gameStore = useGameStore()

  const fileInputRef = ref<HTMLInputElement>()
  const isExporting = ref(false)
  const isCheckingVersion = ref(false)
  const cooldownTime = ref('')

  const showConfirmDialog = ref(false)
  const confirmTitle = ref('')
  const confirmMessage = ref('')
  let confirmCallback: (() => void) | null = null

  // 玩家名稱：每鍵即時儲存（重整不丟）；空值時不彈回，失焦時才補預設名
  const normalizePlayerName = () => {
    if (!gameStore.player.name.trim()) {
      gameStore.player.name = t('common.playerName')
    }
  }

  const isTypesExpanded = ref(false)

  // WebDAV 相關狀態
  const showWebDAVConfig = ref(false)
  const showWebDAVFiles = ref(false)
  const webdavConfig = computed(() => gameStore.webdavConfig)
  const isWebDAVUploading = ref(false)

  // 確保通知設定存在
  if (!gameStore.notificationSettings) {
    gameStore.notificationSettings = {
      browser: false,
      inApp: true,
      suppressInFocus: false,
      types: { construction: true, research: true, unlock: true }
    }
  }

  const areMainSwitchesOff = computed(() => {
    const s = gameStore.notificationSettings
    return !s?.browser && !s?.inApp
  })

  // 當主開關關閉時自動摺疊
  // watch(areMainSwitchesOff, (val) => {
  //   if (val) isTypesExpanded.value = false
  // })

  const updateInAppSetting = (val: boolean) => {
    if (gameStore.notificationSettings) {
      gameStore.notificationSettings.inApp = val
    }
  }

  const updateSuppressSetting = (val: boolean) => {
    if (gameStore.notificationSettings) {
      gameStore.notificationSettings.suppressInFocus = val
    }
  }

  const updateTypeSetting = (key: 'construction' | 'research' | 'unlock', val: boolean) => {
    if (gameStore.notificationSettings) {
      gameStore.notificationSettings.types[key] = val
    }
  }

  const toggleType = (key: 'construction' | 'research' | 'unlock') => {
    if (gameStore.notificationSettings) {
      const current = gameStore.notificationSettings.types[key]
      gameStore.notificationSettings.types[key] = !current
    }
  }

  const handleBrowserSwitch = async (checked: boolean) => {
    if (!gameStore.notificationSettings) return

    if (checked) {
      const granted = await gameStore.requestBrowserPermission()
      if (granted) {
        gameStore.notificationSettings.browser = true
        toast.success(t('settings.permissionGranted'))
      } else {
        gameStore.notificationSettings.browser = false
        toast.error(t('settings.permissionDenied'))
      }
    } else {
      gameStore.notificationSettings.browser = false
    }
  }

  // 計算是否可以檢查版本（主動檢測：5分鐘內不能重複檢查）
  const canCheck = computed(() => canCheckVersion(gameStore.player.lastManualUpdateCheck || 0))

  // 計算剩餘冷卻時間
  const updateCooldownTime = () => {
    if (canCheck.value) {
      cooldownTime.value = ''
      return
    }

    const lastCheck = gameStore.player.lastManualUpdateCheck || 0
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    const timePassed = now - lastCheck
    const timeRemaining = fiveMinutes - timePassed

    if (timeRemaining <= 0) {
      cooldownTime.value = ''
      return
    }

    const minutes = Math.floor(timeRemaining / 60000)
    const seconds = Math.floor((timeRemaining % 60000) / 1000)
    cooldownTime.value = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  // 每秒更新倒計時
  let cooldownInterval: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    updateCooldownTime()
    cooldownInterval = setInterval(updateCooldownTime, 1000)
  })

  onUnmounted(() => {
    if (cooldownInterval) clearInterval(cooldownInterval)
  })

  const openGithub = () => {
    window.open(`https://github.com/${pkg.author.name}/${pkg.name}`, '_blank')
  }

  const openQQGroup = () => {
    window.open(`https://qm.qq.com/q/${pkg.id}`, '_blank')
  }

  // 隱私協議彈窗狀態
  const showPrivacyDialog = ref(false)

  // 開啟隱私協議彈窗
  const openPrivacy = () => {
    showPrivacyDialog.value = true
  }

  // 手動檢查版本
  const showUpdateDialog = ref(false)
  const updateInfo = ref<VersionInfo | null>(null)

  const handleCheckVersion = async () => {
    if (isCheckingVersion.value || !canCheck.value) return

    isCheckingVersion.value = true
    try {
      const versionInfo = await checkLatestVersion(gameStore.player.lastManualUpdateCheck || 0, (time: number) => {
        gameStore.player.lastManualUpdateCheck = time
      })
      if (versionInfo) {
        updateInfo.value = versionInfo
        showUpdateDialog.value = true
      } else {
        toast.success(t('settings.upToDate'))
      }
    } catch (error) {
      console.error('Failed to check for updates:', error)
      toast.error(t('settings.checkUpdateFailed'))
    } finally {
      isCheckingVersion.value = false
    }
  }

  // 匯出資料（包含遊戲資料和地圖資料）
  const handleExport = async () => {
    try {
      isExporting.value = true

      // 獲取遊戲資料
      const gameData = localStorage.getItem(pkg.name)
      // 獲取地圖資料
      const universeData = localStorage.getItem(`${pkg.name}-universe`)
      // 獲取npc資料
      const npcData = localStorage.getItem(`${pkg.name}-npcs`)

      if (!gameData) {
        toast.error(t('settings.exportFailed'))
        return
      }

      // 合併資料
      const exportData = {
        game: gameData,
        npcs: npcData,
        universe: universeData || null
      }

      const fileName = `${pkg.name}-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`
      const jsonString = JSON.stringify(exportData, null, 2)

      // Android/原生平臺
      if (Capacitor.isNativePlatform()) {
        // 嘗試儲存到公共 Downloads 目錄
        try {
          const permStatus = await Filesystem.checkPermissions()
          if (permStatus.publicStorage === 'granted') {
            const result = await Filesystem.writeFile({
              path: `Download/${fileName}`,
              data: jsonString,
              directory: Directory.ExternalStorage,
              encoding: Encoding.UTF8
            })
            toast.success(t('settings.exportSuccessWithPath', { path: result.uri }))
            return
          }

          // 嘗試請求權限
          const reqResult = await Filesystem.requestPermissions()
          if (reqResult.publicStorage === 'granted') {
            const result = await Filesystem.writeFile({
              path: `Download/${fileName}`,
              data: jsonString,
              directory: Directory.ExternalStorage,
              encoding: Encoding.UTF8
            })
            toast.success(t('settings.exportSuccessWithPath', { path: result.uri }))
            return
          }
        } catch (extError) {
          console.warn('ExternalStorage failed, trying Documents:', extError)
        }

        // 備選方案：儲存到應用文件目錄 (TapPlay 等沙盒環境)
        try {
          const result = await Filesystem.writeFile({
            path: fileName,
            data: jsonString,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          })
          toast.success(t('settings.exportSuccessWithPath', { path: result.uri }))
          return
        } catch (docError) {
          console.warn('Documents failed, trying Data:', docError)
        }

        // 最後備選：儲存到應用資料目錄
        try {
          const result = await Filesystem.writeFile({
            path: fileName,
            data: jsonString,
            directory: Directory.Data,
            encoding: Encoding.UTF8
          })
          toast.success(t('settings.exportSuccessWithPath', { path: result.uri }))
          return
        } catch (dataError) {
          console.warn('Data directory failed:', dataError)
        }

        // 所有檔案系統方式都失敗，嘗試 Web Share API
        if (navigator.share && navigator.canShare) {
          const file = new File([jsonString], fileName, { type: 'application/json' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: t('settings.exportData')
            })
            toast.success(t('settings.exportSuccess'))
            return
          }
        }

        // 最後的備選：複製到剪貼簿
        try {
          await navigator.clipboard.writeText(jsonString)
          toast.success(t('settings.exportCopiedToClipboard'))
          return
        } catch {
          toast.error(t('settings.exportFailed'))
        }
      } else {
        // Web 使用 file-saver
        saveAs(new Blob([jsonString], { type: 'application/json' }), fileName)
        toast.success(t('settings.exportSuccess'))
      }
    } catch (error) {
      console.error('Export failed:', error)
      toast.error(t('settings.exportFailed'))
    } finally {
      isExporting.value = false
    }
  }

  // 觸發檔案選擇
  const triggerFileInput = () => {
    fileInputRef.value?.click()
  }

  // 處理檔案選擇
  const handleFileSelect = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    confirmTitle.value = t('settings.importConfirmTitle')
    confirmMessage.value = t('settings.importConfirmMessage')
    showConfirmDialog.value = true
    gameStore.isPaused = true
    confirmCallback = () => importData(file)
  }

  // 匯入資料（包含遊戲資料和地圖資料）
  const importData = async (file: File) => {
    try {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const result = e.target?.result
          if (typeof result === 'string') {
            const importData = JSON.parse(result)

            if (importData.data) {
              const data = decryptData(importData.data)
              const gameCiphertext = encryptData(data.game)
              try {
                parseSave(gameCiphertext)
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                toast.error(t('settings.importFailed') + ': ' + message)
                return
              }
              localStorage.setItem(pkg.name, gameCiphertext)
              localStorage.setItem(`${pkg.name}-universe`, encryptData(data.universe))
              localStorage.setItem(`${pkg.name}-npcs`, encryptData(data.npcs))
              setTimeout(() => window.location.reload(), 1000)
              return
            }

            // 相容舊版本：如果是舊格式（直接是字串），只匯入遊戲資料
            if (typeof importData === 'string' || !importData.game) {
              try {
                parseSave(result)
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                toast.error(t('settings.importFailed') + ': ' + message)
                return
              }
              localStorage.setItem(pkg.name, result)
              toast.success(t('settings.importSuccess'))
              setTimeout(() => window.location.reload(), 1000)
              return
            }

            // 新格式：分別匯入遊戲資料和地圖資料
            if (importData.game) {
              try {
                parseSave(importData.game)
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                toast.error(t('settings.importFailed') + ': ' + message)
                return
              }
              localStorage.setItem(pkg.name, importData.game)
            }

            if (importData.universe) {
              localStorage.setItem(`${pkg.name}-universe`, importData.universe)
            }

            if (importData.npcs) {
              localStorage.setItem(`${pkg.name}-npcs`, importData.npcs)
            }

            toast.success(t('settings.importSuccess'))
            // 延遲重新整理頁面以讓toast顯示
            setTimeout(() => window.location.reload(), 1000)
          } else {
            toast.error(t('settings.importFailed'))
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          toast.error(t('settings.importFailed') + ': ' + message)
        }
      }
      reader.readAsText(file)
    } catch (error) {
      console.error('Import failed:', error)
      toast.error(t('settings.importFailed'))
    }
  }

  // 清除資料
  const handleClearData = () => {
    gameStore.isPaused = true
    confirmTitle.value = t('settings.clearConfirmTitle')
    confirmMessage.value = t('settings.clearConfirmMessage')
    showConfirmDialog.value = true
    confirmCallback = clearData
  }

  const clearData = () => {
    gameStore.isPaused = true
    // 先清一次；再用 pagehide 兜底——clear 和 reload 之間 game loop 的 tick
    // 可能又把存檔寫回 localStorage，pagehide 是解除安裝前最後一道，可靠清除
    const wipe = () => { try { localStorage.clear() } catch {} }
    wipe()
    window.addEventListener('beforeunload', wipe)
    window.addEventListener('pagehide', wipe)
    try {
      window.location.reload()
    } catch (error) {
      console.error('Failed to clear data:', error)
      // 即使出錯也嘗試重新載入
      window.location.reload()
    }
  }

  // 增加遊戲倍率
  const increaseSpeed = () => {
    if (gameStore.gameSpeed < 100) {
      gameStore.gameSpeed = Math.min(100, gameStore.gameSpeed + 0.5)
      toast.success(t('settings.speedChanged', { speed: gameStore.gameSpeed }))
    }
  }

  // 減少遊戲倍率
  const decreaseSpeed = () => {
    if (gameStore.gameSpeed > 0.5) {
      gameStore.gameSpeed = Math.max(0.5, gameStore.gameSpeed - 0.5)
      toast.success(t('settings.speedChanged', { speed: gameStore.gameSpeed }))
    }
  }

  // 重置遊戲倍率
  const resetSpeed = () => {
    gameStore.gameSpeed = 1
    toast.success(t('settings.speedReset'))
  }

  // 切換遊戲暫停狀態
  const togglePause = () => {
    gameStore.isPaused = !gameStore.isPaused
    if (gameStore.isPaused) {
      toast.info(t('settings.gamePaused'))
    } else {
      toast.success(t('settings.gameResumed'))
    }
  }

  // 切換 NPC 名稱語言，並重新命名現有 NPC
  const toggleNpcNameLocale = (useEnglish: boolean) => {
    gameStore.npcNameLocale = useEnglish ? 'en' : 'auto'
    const locale = resolveNPCNameLocale(gameStore.npcNameLocale, gameStore.locale)
    const npcStore = useNPCStore()
    let count = 0
    npcStore.npcs.forEach((npc: NPC) => {
      const newName = updateNPCName(npc.id, locale)
      if (newName !== npc.name) {
        npc.name = newName
        count++
      }
    })
    toast.success(t('settings.npcNameUpdateSuccess', { count }))
  }

  // 確認操作
  const confirmAction = () => {
    if (confirmCallback) {
      confirmCallback()
      confirmCallback = null
    }
    showConfirmDialog.value = false
  }

  // 取消操作
  const cancelAction = () => {
    gameStore.isPaused = false
    confirmCallback = null
    showConfirmDialog.value = false
    // 重置檔案輸入
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }

  // 重置提示
  const handleResetHints = () => {
    resetHints()
    toast.success(t('hints.resetHints'))
  }

  // 更新背景設定
  const updateBackgroundSetting = (val: boolean) => {
    gameStore.player.backgroundEnabled = val
  }

  // WebDAV 上傳
  const handleWebDAVUpload = async () => {
    if (!webdavConfig.value) return

    isWebDAVUploading.value = true
    try {
      // 獲取遊戲資料
      const gameData = localStorage.getItem(pkg.name)
      const universeData = localStorage.getItem(`${pkg.name}-universe`)
      const npcData = localStorage.getItem(`${pkg.name}-npcs`)

      if (!gameData) {
        toast.error(t('settings.exportFailed'))
        return
      }

      // 合併資料
      const exportData = {
        game: gameData,
        npcs: npcData,
        universe: universeData || null
      }

      const jsonString = JSON.stringify(exportData, null, 2)
      const result = await uploadToWebDAV(webdavConfig.value, jsonString)

      if (result.success) {
        toast.success(t('settings.webdav.uploadSuccess'))
      } else {
        toast.error(t(result.messageKey) || t('settings.webdav.uploadFailed'))
      }
    } catch (error) {
      console.error('WebDAV upload failed:', error)
      toast.error(t('settings.webdav.uploadFailed'))
    } finally {
      isWebDAVUploading.value = false
    }
  }

  // WebDAV 下載
  const handleWebDAVDownload = async (fileName: string) => {
    if (!webdavConfig.value) return

    try {
      const result = await downloadFromWebDAV(webdavConfig.value, fileName)

      if (!result.success || !result.data) {
        toast.error(t(result.messageKey) || t('settings.webdav.downloadFailed'))
        return
      }

      // 確認匯入
      confirmTitle.value = t('settings.importConfirmTitle')
      confirmMessage.value = t('settings.importConfirmMessage')
      showConfirmDialog.value = true
      gameStore.isPaused = true

      confirmCallback = () => {
        try {
          const importData = JSON.parse(result.data!)

          // M1 嚴格校驗：版本與結構，損壞給明確錯誤（拋 SaveError，message 直接展示）
          validateSaveImportBundle(importData)

          // 相容舊版本格式
          if (typeof importData === 'string' || !importData.game) {
            localStorage.setItem(pkg.name, result.data!)
          } else {
            if (importData.game) {
              localStorage.setItem(pkg.name, importData.game)
            }
            if (importData.universe) {
              localStorage.setItem(`${pkg.name}-universe`, importData.universe)
            }
            if (importData.npcs) {
              localStorage.setItem(`${pkg.name}-npcs`, importData.npcs)
            }
          }

          toast.success(t('settings.importSuccess'))
          setTimeout(() => window.location.reload(), 1000)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          toast.error(t('settings.importFailed') + ': ' + message)
        }
      }
    } catch (error) {
      console.error('WebDAV download failed:', error)
      toast.error(t('settings.webdav.downloadFailed'))
    }
  }
</script>
