<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button variant="outline" size="icon" class="relative">
        <Siren class="h-4 w-4" />
        <Badge
          v-if="activeAlerts.length > 0"
          variant="destructive"
          class="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs animate-pulse"
        >
          {{ activeAlerts.length }}
        </Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-96 p-0" align="end">
      <div class="flex items-center justify-between p-4 border-b">
        <h3 class="font-semibold">{{ t('enemyAlert.title') }}</h3>
        <Button v-if="activeAlerts.length > 0" variant="ghost" size="sm" @click="markAllAsRead">
          {{ t('enemyAlert.markAllRead') }}
        </Button>
      </div>
      <ScrollArea class="h-auto max-h-96 overflow-y-auto">
        <Empty v-if="activeAlerts.length === 0" class="border-0">
          <EmptyContent>
            <Shield class="h-10 w-10 text-muted-foreground" />
            <EmptyDescription>{{ t('enemyAlert.noAlerts') }}</EmptyDescription>
          </EmptyContent>
        </Empty>
        <div v-else class="divide-y">
          <div
            v-for="alert in activeAlerts"
            :key="alert.id"
            class="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
            :class="{ 'bg-destructive/10': !alert.read }"
            @click="handleAlertClick(alert)"
          >
            <div class="flex items-center gap-3">
              <!-- 左側：任務圖示 -->
              <div class="shrink-0">
                <component :is="getMissionIcon(alert.missionType)" class="h-5 w-5" :class="getMissionIconColor(alert.missionType)" />
              </div>
              <!-- 中間：主要資訊 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm truncate">{{ getNpcName(alert) }}</span>
                  <Badge :variant="getMissionBadgeVariant(alert.missionType)" class="text-xs shrink-0">
                    {{ getMissionTypeText(alert.missionType) }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ alert.targetPlanetName }} · {{ t('enemyAlert.fleetSize') }}: {{ alert.fleetSize }}
                </p>
              </div>
              <!-- 右側：倒計時 -->
              <div class="shrink-0 text-right">
                <span class="text-sm font-bold block" :class="getRemainingTimeColor(alert)">
                  {{ formatRemainingTime(alert) }}
                </span>
              </div>
              <!-- 未讀標記 -->
              <span v-if="!alert.read" class="h-2 w-2 rounded-full bg-destructive shrink-0 animate-pulse" />
            </div>
          </div>
        </div>
      </ScrollArea>
      <div v-if="activeAlerts.length > 0" class="p-2 border-t">
        <Button variant="ghost" size="sm" class="w-full" @click="goToFleet">
          {{ t('enemyAlert.viewFleet') }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>

  <!-- 警報詳情對話方塊 -->
  <Dialog :open="detailDialogOpen" @update:open="detailDialogOpen = $event">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component
            v-if="selectedAlert"
            :is="getMissionIcon(selectedAlert.missionType)"
            class="h-5 w-5"
            :class="getMissionIconColor(selectedAlert.missionType)"
          />
          {{ t('enemyAlert.alertDetails') }}
        </DialogTitle>
        <DialogDescription class="sr-only">
          {{ t('enemyAlert.alertDetails') }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="selectedAlert" class="space-y-4">
        <!-- 敵方資訊 -->
        <div class="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold text-lg">{{ getNpcName(selectedAlert) }}</h3>
              <Badge :variant="getMissionBadgeVariant(selectedAlert.missionType)">
                {{ getMissionTypeText(selectedAlert.missionType) }}
              </Badge>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ t('enemyAlert.fleetSize') }}: {{ selectedAlert.fleetSize }} {{ t('enemyAlert.ships') }}
            </p>
          </div>
        </div>

        <!-- 目標資訊 -->
        <div class="space-y-2">
          <h4 class="font-semibold text-sm">{{ t('enemyAlert.targetInfo') }}</h4>
          <div class="p-3 bg-muted/30 rounded-md flex items-center gap-2">
            <Globe class="h-4 w-4 text-blue-500" />
            <span class="font-medium">{{ selectedAlert.targetPlanetName }}</span>
          </div>
        </div>

        <!-- 到達時間 -->
        <div class="space-y-2">
          <h4 class="font-semibold text-sm">{{ t('enemyAlert.arrivalTime') }}</h4>
          <div class="p-3 bg-muted/30 rounded-md">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('enemyAlert.countdown') }}</span>
              <span class="font-bold text-lg" :class="getRemainingTimeColor(selectedAlert)">
                {{ formatRemainingTime(selectedAlert) }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              {{ formatDate(selectedAlert.arrivalTime) }}
            </p>
          </div>
        </div>

        <!-- 警告提示 -->
        <div class="p-3 bg-destructive/10 rounded-md border border-destructive/20">
          <p class="text-sm text-destructive dark:text-red-400">
            {{ getMissionWarningText(selectedAlert.missionType) }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="detailDialogOpen = false">{{ t('common.close') }}</Button>
        <Button @click="goToMessagesFromDialog">{{ t('enemyAlert.viewMessages') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
  import { getGameNow } from '@/logic/gameTime'
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useGameStore } from '@/stores/gameStore'
  import { useNPCStore } from '@/stores/npcStore'
  import { useI18n } from '@/composables/useI18n'
  import { Button } from '@/components/ui/button'
  import { Badge } from '@/components/ui/badge'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { Empty, EmptyContent, EmptyDescription } from '@/components/ui/empty'
  import { Siren, Eye, Sword, Shield, Globe, Recycle } from 'lucide-vue-next'
  import { MissionType } from '@/types/game'
  import type { IncomingFleetAlert } from '@/types/game'
  import { formatDate, formatTime } from '@/utils/format'

  const router = useRouter()
  const gameStore = useGameStore()
  const npcStore = useNPCStore()
  const { t } = useI18n()
  const isOpen = ref(false)
  const detailDialogOpen = ref(false)
  const selectedAlert = ref<IncomingFleetAlert | null>(null)
  const currentTime = ref(getGameNow())
  let timeInterval: ReturnType<typeof setInterval> | null = null

  // 啟動計時器，用於實時更新倒計時
  onMounted(() => {
    timeInterval = setInterval(() => {
      currentTime.value = getGameNow()
    }, 1000)
  })

  onUnmounted(() => {
    if (timeInterval) {
      clearInterval(timeInterval)
      timeInterval = null
    }
  })

  // 獲取活躍的警報（未到達的）
  const activeAlerts = computed(() => {
    const now = currentTime.value
    return (gameStore.player.incomingFleetAlerts || [])
      .filter(alert => alert.arrivalTime > now)
      .sort((a, b) => a.arrivalTime - b.arrivalTime) // 按到達時間排序
  })

  /**
   * 獲取NPC當前名稱
   * 優先使用當前NPC的實際名稱，如果NPC不存在則嘗試從舊名稱中提取ID查詢
   */
  const getNpcName = (alert: IncomingFleetAlert): string => {
    if (!npcStore.npcs?.length) return alert.npcName

    // 1. 先透過 npcId 查詢
    if (alert.npcId) {
      const npc = npcStore.npcs.find(n => n.id === alert.npcId)
      if (npc) return npc.name
    }

    // 2. 嘗試從舊名稱中提取ID並查詢
    // 舊格式如 "NPC-npc_182"，新ID格式為 "npc_182"
    const idMatch = alert.npcName.match(/npc_\d+/)
    if (idMatch) {
      const extractedId = idMatch[0]
      const npc = npcStore.npcs.find(n => n.id === extractedId)
      if (npc) return npc.name
    }

    return alert.npcName
  }

  // 獲取任務型別圖示
  const getMissionIcon = (missionType: MissionType) => {
    switch (missionType) {
      case MissionType.Spy:
        return Eye
      case MissionType.Attack:
        return Sword
      case MissionType.Recycle:
        return Recycle
      default:
        return Siren
    }
  }

  // 獲取任務型別圖示顏色
  const getMissionIconColor = (missionType: MissionType) => {
    switch (missionType) {
      case MissionType.Spy:
        return 'text-purple-500'
      case MissionType.Attack:
        return 'text-red-500'
      case MissionType.Recycle:
        return 'text-amber-500'
      default:
        return 'text-yellow-500'
    }
  }

  // 獲取任務型別Badge樣式
  const getMissionBadgeVariant = (missionType: MissionType): 'destructive' | 'secondary' => {
    return missionType === MissionType.Attack ? 'destructive' : 'secondary'
  }

  // 獲取任務型別文字
  const getMissionTypeText = (missionType: MissionType) => {
    switch (missionType) {
      case MissionType.Spy:
        return t('enemyAlert.missionType.spy')
      case MissionType.Attack:
        return t('enemyAlert.missionType.attack')
      case MissionType.Recycle:
        return t('enemyAlert.missionType.recycle')
      default:
        return t('enemyAlert.missionType.unknown')
    }
  }

  // 獲取任務警告文字
  const getMissionWarningText = (missionType: MissionType) => {
    switch (missionType) {
      case MissionType.Spy:
        return t('enemyAlert.warning.spy')
      case MissionType.Attack:
        return t('enemyAlert.warning.attack')
      case MissionType.Recycle:
        return t('enemyAlert.warning.recycle')
      default:
        return t('enemyAlert.warning.unknown')
    }
  }

  // 格式化剩餘時間
  const formatRemainingTime = (alert: IncomingFleetAlert) => {
    const remaining = Math.max(0, Math.floor((alert.arrivalTime - currentTime.value) / 1000))
    if (remaining <= 0) {
      return t('enemyAlert.arrived')
    }
    return formatTime(remaining)
  }

  // 獲取剩餘時間顏色
  const getRemainingTimeColor = (alert: IncomingFleetAlert) => {
    const remaining = alert.arrivalTime - currentTime.value
    if (remaining <= 0) return 'text-red-600 dark:text-red-400 font-bold' // 已到達
    if (remaining < 60000) return 'text-red-600 dark:text-red-400' // < 1分鐘
    if (remaining < 300000) return 'text-orange-600 dark:text-orange-400' // < 5分鐘
    return 'text-muted-foreground'
  }

  // 處理警報點選
  const handleAlertClick = (alert: IncomingFleetAlert) => {
    alert.read = true
    selectedAlert.value = alert
    isOpen.value = true
    // 開啟對話方塊
    detailDialogOpen.value = true
  }

  // 標記所有為已讀
  const markAllAsRead = () => {
    gameStore.player.incomingFleetAlerts?.forEach(alert => {
      alert.read = true
    })
  }

  // 跳轉到艦隊頁面
  const goToFleet = () => {
    isOpen.value = false
    router.push('/fleet')
  }

  // 從對話方塊跳轉到訊息頁面
  const goToMessagesFromDialog = () => {
    detailDialogOpen.value = false
    router.push('/messages')
  }

  // 開啟彈窗（供外部呼叫）
  const open = () => {
    isOpen.value = true
  }

  // 暴露方法給父元件
  defineExpose({
    open
  })
</script>
