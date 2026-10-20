<template>
  <div class="rounded-lg transition-shadow duration-300">
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <CardTitle class="flex items-center gap-2 flex-wrap">
              {{ npc.name }}
              <span v-if="npc.note" class="text-muted-foreground font-normal">({{ npc.note }})</span>
              <Badge :variant="statusBadgeVariant">
                {{ statusText }}
              </Badge>
              <!-- NPC難度等級徽章 -->
              <Badge
                v-if="npc.difficultyLevel"
                :variant="difficultyBadgeVariant"
                :class="difficultyLevelColor"
              >
                Lv.{{ npc.difficultyLevel }}
              </Badge>
            </CardTitle>
            <CardDescription class="mt-1">
              {{ npc.planets.length }} {{ t('diplomacy.planets') }}
              <span v-if="npc.allies && npc.allies.length > 0" class="ml-2">· {{ npc.allies.length }} {{ t('diplomacy.allies') }}</span>
            </CardDescription>
          </div>
          <!-- 編輯備註按鈕 -->
          <Button
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0"
            @click="openNoteDialog"
            :title="npc.note ? t('diplomacy.actions.editNote') : t('diplomacy.actions.addNote')"
          >
            <Pencil class="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 好感度進度條 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">{{ t('diplomacy.reputation') }}</span>
            <span class="font-semibold" :class="reputationColor">{{ reputation > 0 ? '+' : '' }}{{ reputation }}</span>
          </div>
          <div class="relative">
            <!-- 背景進度條 -->
            <div class="h-2 bg-muted rounded-full overflow-hidden">
              <!-- 負值部分（左側，紅色） -->
              <div
                v-if="reputation < 0"
                class="h-full bg-red-500 dark:bg-red-600 absolute right-1/2"
                :style="{ width: `${Math.abs(reputation) / 2}%` }"
              />
              <!-- 正值部分（右側，綠色） -->
              <div
                v-if="reputation > 0"
                class="h-full bg-green-500 dark:bg-green-600 absolute left-1/2"
                :style="{ width: `${reputation / 2}%` }"
              />
            </div>
            <!-- 中心線 -->
            <div class="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
          </div>
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>-100</span>
            <span>0</span>
            <span>+100</span>
          </div>
        </div>

        <!-- 盟友資訊 -->
        <div v-if="npc.allies && npc.allies.length > 0" class="pt-2 border-t">
          <p class="text-sm text-muted-foreground mb-2">{{ t('diplomacy.alliedWith') }}:</p>
          <div class="flex flex-wrap gap-1">
            <Badge
              v-for="allyId in npc.allies.slice(0, 3)"
              :key="allyId"
              variant="outline"
              class="text-xs cursor-pointer hover:bg-accent transition-colors"
              :class="getAllyBorderClass(allyId)"
              @click="scrollToAlly(allyId)"
            >
              {{ getAllyName(allyId) }}
            </Badge>
            <Badge v-if="npc.allies.length > 3" variant="outline" class="text-xs">
              +{{ npc.allies.length - 3 }} {{ t('diplomacy.more') }}
            </Badge>
          </div>
        </div>

        <!-- 操作按鈕 -->
        <div class="flex gap-2 pt-2">
          <Button size="sm" variant="outline" class="flex-1" @click="handleGiftResources">
            <Gift class="h-4 w-4 mr-2" />
            {{ t('diplomacy.actions.gift') }}
          </Button>
          <Button size="sm" variant="outline" class="flex-1" @click="handleViewPlanets">
            <Globe class="h-4 w-4 mr-2" />
            {{ t('diplomacy.actions.viewPlanets') }}
          </Button>
        </div>

        <!-- 最近活動 -->
        <div v-if="recentEvent" class="pt-2 border-t">
          <p class="text-xs text-muted-foreground mb-1">{{ t('diplomacy.lastEvent') }}:</p>
          <div class="flex items-center gap-2 text-xs">
            <component :is="getEventIcon(recentEvent.reason)" class="h-3 w-3" />
            <span>{{ getEventText(recentEvent.reason) }}</span>
            <span class="text-muted-foreground">
              {{ formatRelativeTime((Date.now() - recentEvent.timestamp) / 1000, t) }}{{ t('diplomacy.ago') }}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 備註編輯對話方塊 -->
    <Dialog v-model:open="noteDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ npc.note ? t('diplomacy.actions.editNote') : t('diplomacy.actions.addNote') }}</DialogTitle>
          <DialogDescription class="sr-only">{{ t('diplomacy.note') }}</DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Input v-model="noteInput" :placeholder="t('diplomacy.notePlaceholder')" @keyup.enter="saveNote" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="noteDialogOpen = false">{{ t('common.cancel') }}</Button>
          <Button @click="saveNote">{{ t('common.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useNPCStore } from '@/stores/npcStore'
  import { useGameStore } from '@/stores/gameStore'
  import { useI18n } from '@/composables/useI18n'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
  import { Input } from '@/components/ui/input'
  import { Gift, Globe, Sword, Eye, Trash2, Pencil } from 'lucide-vue-next'
  import { RelationStatus, DiplomaticEventType } from '@/types/game'
  import type { DiplomaticRelation, NPC } from '@/types/game'
  import { formatRelativeTime } from '@/utils/format'

  const props = defineProps<{
    npc: NPC
    relation?: DiplomaticRelation
  }>()

  const router = useRouter()
  const npcStore = useNPCStore()
  const gameStore = useGameStore()
  const { t } = useI18n()

  // 備註對話方塊狀態
  const noteDialogOpen = ref(false)
  const noteInput = ref('')

  // 開啟備註對話方塊
  const openNoteDialog = () => {
    noteInput.value = props.npc.note || ''
    noteDialogOpen.value = true
  }

  // 儲存備註
  const saveNote = () => {
    const npc = npcStore.npcs.find(n => n.id === props.npc.id)
    if (npc) {
      npc.note = noteInput.value.trim() || undefined
    }
    noteDialogOpen.value = false
  }

  // 好感度值
  const reputation = computed(() => props.relation?.reputation || 0)

  // 關係狀態
  const status = computed(() => props.relation?.status || RelationStatus.Neutral)

  // 關係狀態文字
  const statusText = computed(() => {
    switch (status.value) {
      case RelationStatus.Friendly:
        return t('diplomacy.status.friendly')
      case RelationStatus.Hostile:
        return t('diplomacy.status.hostile')
      default:
        return t('diplomacy.status.neutral')
    }
  })

  // 關係狀態Badge樣式
  const statusBadgeVariant = computed(() => {
    switch (status.value) {
      case RelationStatus.Friendly:
        return 'default'
      case RelationStatus.Hostile:
        return 'destructive'
      default:
        return 'secondary'
    }
  })

  // 好感度顏色
  const reputationColor = computed(() => {
    if (reputation.value >= 20) return 'text-green-600 dark:text-green-400'
    if (reputation.value <= -20) return 'text-red-600 dark:text-red-400'
    return 'text-muted-foreground'
  })

  // NPC難度等級顏色
  const difficultyLevelColor = computed(() => {
    const level = props.npc.difficultyLevel
    if (!level) return 'text-muted-foreground'
    if (level <= 1) return 'text-green-600 dark:text-green-400' // 新手
    if (level <= 2) return 'text-lime-600 dark:text-lime-400' // 簡單
    if (level <= 3) return 'text-yellow-600 dark:text-yellow-400' // 普通
    if (level <= 4) return 'text-orange-600 dark:text-orange-400' // 困難
    if (level <= 5) return 'text-red-600 dark:text-red-400' // 專家
    if (level <= 6) return 'text-purple-600 dark:text-purple-400' // 大師
    return 'text-pink-600 dark:text-pink-400' // 傳奇及以上
  })

  // NPC難度等級Badge樣式
  const difficultyBadgeVariant = computed((): 'default' | 'secondary' | 'destructive' | 'outline' => {
    const level = props.npc.difficultyLevel
    if (!level) return 'outline'
    if (level <= 2) return 'secondary'
    if (level <= 4) return 'default'
    return 'destructive'
  })

  // 最近的外交事件
  const recentEvent = computed(() => {
    if (!props.relation?.history || props.relation.history.length === 0) return null
    return props.relation.history[props.relation.history.length - 1]
  })

  // 獲取盟友名稱
  const getAllyName = (allyId: string) => {
    const ally = npcStore.npcs.find(n => n.id === allyId)
    if (!ally) return allyId.substring(0, 8)
    return ally.note ? `${ally.name}(${ally.note})` : ally.name
  }

  // 獲取盟友與玩家的外交關係狀態對應的邊框樣式
  const getAllyBorderClass = (allyId: string) => {
    const ally = npcStore.npcs.find(n => n.id === allyId)
    if (!ally) return ''

    const allyRelation = ally.relations?.[gameStore.player.id]
    if (!allyRelation) return '' // 無關係，使用預設邊框

    switch (allyRelation.status) {
      case RelationStatus.Friendly:
        return 'border-green-500 dark:border-green-400'
      case RelationStatus.Hostile:
        return 'border-red-500 dark:border-red-400'
      default:
        return '' // 中立，使用預設邊框
    }
  }

  // 獲取事件圖示
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case DiplomaticEventType.GiftResources:
        return Gift
      case DiplomaticEventType.Attack:
      case DiplomaticEventType.AllyAttacked:
        return Sword
      case DiplomaticEventType.Spy:
        return Eye
      case DiplomaticEventType.StealDebris:
        return Trash2
      default:
        return Gift
    }
  }

  // 獲取事件文字
  const getEventText = (eventType: string) => {
    switch (eventType) {
      case DiplomaticEventType.GiftResources:
        return t('diplomacy.events.gift')
      case DiplomaticEventType.Attack:
        return t('diplomacy.events.attack')
      case DiplomaticEventType.AllyAttacked:
        return t('diplomacy.events.allyAttacked')
      case DiplomaticEventType.Spy:
        return t('diplomacy.events.spy')
      case DiplomaticEventType.StealDebris:
        return t('diplomacy.events.stealDebris')
      default:
        return eventType
    }
  }

  // 贈送資源
  const handleGiftResources = () => {
    // 跳轉到艦隊頁面，自動選擇第一個NPC星球
    if (props.npc.planets.length > 0) {
      const targetPlanet = props.npc.planets[0]
      if (!targetPlanet) return

      router.push({
        path: '/fleet',
        query: {
          galaxy: targetPlanet.position.galaxy,
          system: targetPlanet.position.system,
          position: targetPlanet.position.position,
          gift: '1'
        }
      })
    }
  }

  // 檢視星球
  const handleViewPlanets = () => {
    // 跳轉到星系檢視，定位到第一個NPC星球，並傳遞NPC ID用於高亮
    if (props.npc.planets.length > 0) {
      const targetPlanet = props.npc.planets[0]
      if (!targetPlanet) return

      router.push({
        path: '/galaxy',
        query: {
          galaxy: targetPlanet.position.galaxy,
          system: targetPlanet.position.system,
          highlightNpc: props.npc.id
        }
      })
    }
  }

  // 滾動到盟友卡片
  const scrollToAlly = (allyId: string) => {
    // 觸發父元件的滾動事件
    // 透過emit通知父元件滾動到指定的NPC卡片
    const event = new CustomEvent('scrollToNpc', { detail: { npcId: allyId }, bubbles: true })
    document.dispatchEvent(event)
  }
</script>
