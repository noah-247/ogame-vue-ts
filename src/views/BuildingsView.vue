<template>
  <div v-if="planet" class="container mx-auto p-4 sm:p-6">
    <h1 class="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">{{ t('buildingsView.title') }}</h1>

    <!-- 佔地顯示 -->
    <div class="mb-4 sm:mb-6 p-3 sm:p-4 bg-muted/50 rounded-lg border">
      <div class="flex items-center justify-between">
        <div class="text-sm sm:text-base font-medium flex items-center gap-2">
          <Grid3x3 :size="16" />
          {{ t('buildingsView.spaceUsage') }}:
        </div>
        <div class="text-sm sm:text-base font-bold">
          <span :class="getUsedSpace(planet) > planet.maxSpace ? 'text-destructive' : 'text-primary'">
            {{ formatNumber(getUsedSpace(planet)) }}
          </span>
          <span class="text-muted-foreground mx-1">/</span>
          <span>{{ formatNumber(planet.maxSpace) }}</span>
        </div>
      </div>
      <div class="mt-2">
        <div class="w-full bg-background rounded-full h-2.5 sm:h-3 overflow-hidden">
          <div
            class="h-full transition-all duration-300"
            :class="getUsedSpace(planet) > planet.maxSpace ? 'bg-destructive' : 'bg-primary'"
            :style="{ width: `${Math.min((getUsedSpace(planet) / planet.maxSpace) * 100, 100)}%` }"
          />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      <Card v-for="buildingType in availableBuildings" :key="buildingType" :data-building="buildingType" class="relative">
        <ArtworkImage
          :src="BUILDING_ARTWORK[buildingType]"
          :alt="BUILDINGS[buildingType].name"
          :locked="!isEntityUnlocked(BUILDINGS[buildingType].requirements, getBuildingLevel(buildingType))"
        />
        <!-- 前置條件遮罩 -->
        <CardUnlockOverlay :requirements="BUILDINGS[buildingType].requirements" :currentLevel="getBuildingLevel(buildingType)" />

        <CardHeader>
          <div class="mb-2">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <CardTitle
                class="text-sm sm:text-base lg:text-lg cursor-pointer hover:text-primary transition-colors underline decoration-dotted underline-offset-4 order-2 sm:order-1"
                @click="detailDialog.openBuilding(buildingType, getBuildingLevel(buildingType))"
              >
                {{ BUILDINGS[buildingType].name }}
              </CardTitle>
              <Badge variant="secondary" class="text-xs whitespace-nowrap self-start order-1 sm:order-2">
                Lv {{ getBuildingLevel(buildingType) }}
              </Badge>
            </div>
          </div>
          <CardDescription class="text-xs sm:text-sm">{{ BUILDINGS[buildingType].description }}</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div class="text-xs sm:text-sm space-y-1.5 sm:space-y-2">
              <p class="text-muted-foreground mb-1 sm:mb-2">{{ t('buildingsView.upgradeCost') }}</p>
              <div class="space-y-1 sm:space-y-1.5">
                <div
                  v-for="resourceType in costResourceTypes"
                  :key="resourceType.key"
                  v-show="
                    resourceType.key !== 'darkMatter' || getBuildingCost(buildingType, getBuildingLevel(buildingType) + 1).darkMatter > 0
                  "
                  class="flex items-center gap-1.5 sm:gap-2"
                >
                  <ResourceIcon :type="resourceType.key" size="sm" />
                  <span class="text-xs">{{ t(`resources.${resourceType.key}`) }}:</span>
                  <span
                    class="font-medium text-xs sm:text-sm"
                    :class="
                      getResourceCostColor(
                        planet.resources[resourceType.key],
                        getBuildingCost(buildingType, getBuildingLevel(buildingType) + 1)[resourceType.key]
                      )
                    "
                  >
                    {{ formatNumber(getBuildingCost(buildingType, getBuildingLevel(buildingType) + 1)[resourceType.key]) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="text-xs sm:text-sm space-y-0.5 sm:space-y-1">
              <div class="flex items-center gap-1.5 text-muted-foreground">
                <Clock :size="14" class="shrink-0" />
                <span>{{ formatTime(getBuildingTime(buildingType, getBuildingLevel(buildingType) + 1)) }}</span>
              </div>
              <div class="flex items-center gap-1.5 text-muted-foreground">
                <Grid3x3 :size="14" class="shrink-0" />
                <span>{{ BUILDINGS[buildingType].spaceUsage }}</span>
              </div>
            </div>

            <!-- 升級按鈕 -->
            <Button @click="handleUpgrade(buildingType, $event)" :disabled="!canUpgrade(buildingType)" class="w-full">
              {{ getUpgradeButtonText(buildingType) }}
            </Button>

            <!-- 新增到等待佇列按鈕 -->
            <Button
              v-if="canAddToWaitingQueue(buildingType)"
              @click="handleAddToWaiting(buildingType, $event)"
              variant="outline"
              class="w-full"
            >
              {{ t('queue.addToWaiting') }}
            </Button>

            <!-- 拆除按鈕 -->
            <Button
              v-if="getBuildingLevel(buildingType) > 0"
              @click="handleDemolish(buildingType)"
              :disabled="!canDemolish(buildingType)"
              variant="destructive"
              class="w-full"
            >
              {{ t('buildingsView.demolish') }}
            </Button>

            <!-- 拆除資訊提示 -->
            <div v-if="getBuildingLevel(buildingType) > 0" class="text-xs text-muted-foreground">
              <p>{{ t('buildingsView.demolishRefund') }}</p>
              <div class="flex gap-2 flex-wrap">
                <span class="flex items-center gap-1.5" v-if="getDemolishRefund(buildingType).metal">
                  <ResourceIcon type="metal" size="sm" />
                  {{ formatNumber(getDemolishRefund(buildingType).metal) }}
                </span>
                <span class="flex items-center gap-1.5" v-if="getDemolishRefund(buildingType).crystal">
                  <ResourceIcon type="crystal" size="sm" />
                  {{ formatNumber(getDemolishRefund(buildingType).crystal) }}
                </span>
                <span class="flex items-center gap-1.5" v-if="getDemolishRefund(buildingType).deuterium">
                  <ResourceIcon type="deuterium" size="sm" />
                  {{ formatNumber(getDemolishRefund(buildingType).deuterium) }}
                </span>
                <span class="flex items-center gap-1.5" v-if="getDemolishRefund(buildingType).darkMatter">
                  <ResourceIcon type="darkMatter" size="sm" />
                  {{ formatNumber(getDemolishRefund(buildingType).darkMatter) }}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 提示對話方塊 -->
    <AlertDialog :open="alertDialogOpen" @update:open="alertDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ alertDialogTitle }}</AlertDialogTitle>
          <AlertDialogDescription v-if="!alertDialogShowRequirements" class="whitespace-pre-line">
            {{ alertDialogMessage }}
          </AlertDialogDescription>
          <AlertDialogDescription v-else>
            <div class="space-y-2">
              <div v-for="(req, index) in alertDialogRequirements" :key="index" class="flex items-center gap-2 text-sm">
                <Check v-if="req.met" :size="16" class="text-green-500 shrink-0" />
                <X v-else :size="16" class="text-red-500 shrink-0" />
                <span>{{ req.name }}: Lv {{ req.requiredLevel }} ({{ t('common.current') }}: Lv {{ req.currentLevel }})</span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 拆除確認對話方塊 -->
    <AlertDialog :open="demolishConfirmOpen" @update:open="demolishConfirmOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('buildingsView.confirmDemolish') }}</AlertDialogTitle>
          <AlertDialogDescription class="whitespace-pre-line">
            {{ demolishConfirmMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmDemolish">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
  import { getGameNow } from '@/logic/gameTime'
  import { useGameStore } from '@/stores/gameStore'
  import { useDetailDialogStore } from '@/stores/detailDialogStore'
  import { useI18n } from '@/composables/useI18n'
  import { useGameConfig } from '@/composables/useGameConfig'
  import { computed, ref } from 'vue'
  import { BuildingType, TechnologyType } from '@/types/game'
  import type { Resources, Planet } from '@/types/game'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Button } from '@/components/ui/button'
  import { Badge } from '@/components/ui/badge'
  import ResourceIcon from '@/components/common/ResourceIcon.vue'
  import { isEntityUnlocked } from '@/composables/useUnlockState'
  import ArtworkImage from '@/components/common/ArtworkImage.vue'
  import CardUnlockOverlay from '@/components/common/CardUnlockOverlay.vue'
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
  import { BUILDING_ARTWORK } from '@/config/artwork'
  import { Clock, Grid3x3, Check, X } from 'lucide-vue-next'
  import { formatNumber, formatTime, getResourceCostColor } from '@/utils/format'
  import * as buildingLogic from '@/logic/buildingLogic'
  import * as buildingValidation from '@/logic/buildingValidation'
  import * as publicLogic from '@/logic/publicLogic'
  import * as officerLogic from '@/logic/officerLogic'
  import * as gameLogic from '@/logic/gameLogic'
  import * as waitingQueueLogic from '@/logic/waitingQueueLogic'
  import { triggerQueueAnimation } from '@/composables/useQueueAnimation'

  const gameStore = useGameStore()
  const detailDialog = useDetailDialogStore()
  const { t } = useI18n()
  const { BUILDINGS, TECHNOLOGIES } = useGameConfig()
  const planet = computed(() => gameStore.currentPlanet)

  // AlertDialog 狀態
  const alertDialogOpen = ref(false)
  const alertDialogTitle = ref('')
  const alertDialogMessage = ref('')
  const alertDialogRequirements = ref<Array<{ name: string; requiredLevel: number; currentLevel: number; met: boolean }>>([])
  const alertDialogShowRequirements = ref(false)

  // 防抖狀態：防止快速點選
  const isProcessing = ref(false)
  const DEBOUNCE_DELAY = 300 // 防抖延遲（毫秒）

  // 拆除確認對話方塊狀態
  const demolishConfirmOpen = ref(false)
  const demolishConfirmMessage = ref('')
  const pendingDemolishBuilding = ref<BuildingType | null>(null)

  // 資源型別配置（用於成本顯示）
  const costResourceTypes = [
    { key: 'metal' as const },
    { key: 'crystal' as const },
    { key: 'deuterium' as const },
    { key: 'darkMatter' as const }
  ]

  // 根據星球型別過濾可用建築
  const availableBuildings = computed<BuildingType[]>(() => {
    if (!planet.value) return []
    return (Object.values(BuildingType) as BuildingType[]).filter(buildingType => {
      const config = BUILDINGS.value[buildingType]
      if (planet.value!.isMoon) {
        // 月球可以建造：月球專屬建築 + 非行星專屬建築（如機器人工廠、船塢、機庫等）
        // OGame規則：月球不能建造 planetOnly 的建築（礦場、研究實驗室、奈米工廠等）
        return config.planetOnly !== true
      } else {
        // 行星不能建造月球專屬建築
        return config.moonOnly !== true
      }
    })
  })

  const upgradeBuilding = (buildingType: BuildingType): { success: boolean; reason?: string } => {
    if (!gameStore.currentPlanet) return { success: false }
    const validation = buildingValidation.validateBuildingUpgrade(
      gameStore.currentPlanet,
      buildingType,
      gameStore.player.technologies,
      gameStore.player.officers
    )
    if (!validation.valid) return { success: false, reason: validation.reason }

    // 追蹤資源消耗（在扣除前計算成本）
    const currentLevel = gameStore.currentPlanet.buildings[buildingType] || 0
    const cost = buildingLogic.calculateBuildingCost(buildingType, currentLevel + 1)
    gameLogic.trackResourceConsumption(gameStore.player, cost)

    const queueItem = buildingValidation.executeBuildingUpgrade(gameStore.currentPlanet, buildingType, gameStore.player.officers)
    gameStore.currentPlanet.buildQueue.push(queueItem)
    return { success: true }
  }

  const getUsedSpace = (planet: Planet): number => {
    return buildingLogic.calculateUsedSpace(planet)
  }

  // 升級建築
  const handleUpgrade = (buildingType: BuildingType, event: MouseEvent) => {
    // 防抖：防止快速點選
    if (isProcessing.value) return
    isProcessing.value = true
    setTimeout(() => {
      isProcessing.value = false
    }, DEBOUNCE_DELAY)

    // 檢查前置條件
    if (!checkUpgradeRequirements(buildingType)) {
      alertDialogTitle.value = t('common.requirementsNotMet')
      alertDialogRequirements.value = getRequirementsList(buildingType)
      alertDialogShowRequirements.value = true
      alertDialogMessage.value = ''
      alertDialogOpen.value = true
      return
    }

    const result = upgradeBuilding(buildingType)
    if (!result.success) {
      alertDialogTitle.value = t('buildingsView.upgradeFailed')
      alertDialogMessage.value = result.reason ? t(result.reason) : t('buildingsView.upgradeFailedMessage')
      alertDialogShowRequirements.value = false
      alertDialogOpen.value = true
    } else {
      // 觸發拋物線動畫
      triggerQueueAnimation(event, 'building')
    }
  }

  // 獲取建築等級
  const getBuildingLevel = (buildingType: BuildingType): number => {
    return planet.value?.buildings[buildingType] || 0
  }

  // 檢查升級前置條件是否滿足
  const checkUpgradeRequirements = (buildingType: BuildingType): boolean => {
    if (!planet.value) return false
    const config = BUILDINGS.value[buildingType]
    const currentLevel = getBuildingLevel(buildingType)
    const targetLevel = currentLevel + 1

    // 獲取目標等級的所有前置條件（包括等級門檻）
    const requirements = publicLogic.getLevelRequirements(config, targetLevel)

    if (!requirements || Object.keys(requirements).length === 0) return true
    return publicLogic.checkRequirements(planet.value, gameStore.player.technologies, requirements)
  }

  // 獲取升級按鈕文字
  const getUpgradeButtonText = (buildingType: BuildingType): string => {
    if (!planet.value) return t('buildingsView.upgrade')

    const config = BUILDINGS.value[buildingType]
    const currentLevel = getBuildingLevel(buildingType)

    // 檢查是否達到等級上限
    if (config.maxLevel !== undefined && currentLevel >= config.maxLevel) {
      return t('buildingsView.maxLevelReached') // "等級已滿"
    }

    // 0級為建造，1級及以上為升級
    const buttonTextKey = currentLevel === 0 ? 'buildingsView.build' : 'buildingsView.upgrade'

    if (planet.value.buildQueue.length > 0) return t(buttonTextKey)

    // 檢查前置條件
    if (!checkUpgradeRequirements(buildingType)) {
      return t('buildingsView.requirementsNotMet')
    }

    return t(buttonTextKey)
  }

  // 獲取前置條件列表
  const getRequirementsList = (
    buildingType: BuildingType
  ): Array<{ name: string; requiredLevel: number; currentLevel: number; met: boolean }> => {
    const config = BUILDINGS.value[buildingType]
    const currentLevel = getBuildingLevel(buildingType)
    const targetLevel = currentLevel + 1

    // 獲取目標等級的所有前置條件（包括等級門檻）
    const requirements = publicLogic.getLevelRequirements(config, targetLevel)

    if (!requirements || !planet.value) return []

    const items: Array<{ name: string; requiredLevel: number; currentLevel: number; met: boolean }> = []
    for (const [key, requiredLevel] of Object.entries(requirements)) {
      // 檢查是否為建築型別
      if (Object.values(BuildingType).includes(key as BuildingType)) {
        const bt = key as BuildingType
        const currentLevel = planet.value.buildings[bt] || 0
        const name = BUILDINGS.value[bt]?.name || bt
        items.push({ name, requiredLevel, currentLevel, met: currentLevel >= requiredLevel })
      }
      // 檢查是否為科技型別
      else if (Object.values(TechnologyType).includes(key as TechnologyType)) {
        const tt = key as TechnologyType
        const currentLevel = gameStore.player.technologies[tt] || 0
        const name = TECHNOLOGIES.value[tt]?.name || tt
        items.push({ name, requiredLevel, currentLevel, met: currentLevel >= requiredLevel })
      }
    }
    return items
  }

  // 檢查是否可以升級
  const canUpgrade = (buildingType: BuildingType): boolean => {
    if (!planet.value) return false

    const config = BUILDINGS.value[buildingType]
    const currentLevel = getBuildingLevel(buildingType)

    // 檢查是否達到等級上限
    if (config.maxLevel !== undefined && currentLevel >= config.maxLevel) {
      return false
    }

    // 檢查建造佇列是否已滿（只計算建築型別的佇列項）
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    const maxQueue = publicLogic.getMaxBuildQueue(planet.value, bonuses.additionalBuildQueue)
    const buildingQueueCount = planet.value.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish').length
    if (buildingQueueCount >= maxQueue) {
      return false
    }

    // 檢查前置條件
    const validation = buildingValidation.validateBuildingUpgrade(
      planet.value,
      buildingType,
      gameStore.player.technologies,
      gameStore.player.officers
    )
    if (!validation.valid) return false

    const cost = getBuildingCost(buildingType, currentLevel + 1)

    return (
      planet.value.resources.metal >= cost.metal &&
      planet.value.resources.crystal >= cost.crystal &&
      planet.value.resources.deuterium >= cost.deuterium &&
      planet.value.resources.darkMatter >= cost.darkMatter
    )
  }

  const getBuildingCost = (buildingType: BuildingType, targetLevel: number): Resources => {
    return buildingLogic.calculateBuildingCost(buildingType, targetLevel)
  }

  const getBuildingTime = (buildingType: BuildingType, targetLevel: number): number => {
    if (!planet.value) return 0

    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())

    // 獲取機器人工廠和奈米工廠等級
    const roboticsFactoryLevel = planet.value.buildings[BuildingType.RoboticsFactory] || 0
    const naniteFactoryLevel = planet.value.buildings[BuildingType.NaniteFactory] || 0

    return buildingLogic.calculateBuildingTime(
      buildingType,
      targetLevel,
      bonuses.buildingSpeedBonus,
      roboticsFactoryLevel,
      naniteFactoryLevel
    )
  }

  // 拆除建築
  const demolishBuilding = (buildingType: BuildingType): boolean => {
    if (!gameStore.currentPlanet) return false
    const validation = buildingValidation.validateBuildingDemolish(gameStore.currentPlanet, buildingType, gameStore.player.officers)
    if (!validation.valid) return false
    const queueItem = buildingValidation.executeBuildingDemolish(gameStore.currentPlanet, buildingType, gameStore.player.officers)
    gameStore.currentPlanet.buildQueue.push(queueItem)
    return true
  }

  const handleDemolish = (buildingType: BuildingType) => {
    const refund = getDemolishRefund(buildingType)
    demolishConfirmMessage.value = `${t('buildingsView.demolishRefund')}
${refund.metal ? `${t('resources.metal')}: ${formatNumber(refund.metal)}` : ''}
${refund.crystal ? `${t('resources.crystal')}: ${formatNumber(refund.crystal)}` : ''}
${refund.deuterium ? `${t('resources.deuterium')}: ${formatNumber(refund.deuterium)}` : ''}
${refund.darkMatter ? `${t('resources.darkMatter')}: ${formatNumber(refund.darkMatter)}` : ''}`

    pendingDemolishBuilding.value = buildingType
    demolishConfirmOpen.value = true
  }

  const confirmDemolish = () => {
    if (pendingDemolishBuilding.value) {
      const success = demolishBuilding(pendingDemolishBuilding.value)
      if (!success) {
        alertDialogTitle.value = t('buildingsView.demolishFailed')
        alertDialogMessage.value = t('buildingsView.demolishFailedMessage')
        alertDialogOpen.value = true
      }
    }
    demolishConfirmOpen.value = false
    pendingDemolishBuilding.value = null
  }

  // 檢查是否可以拆除
  const canDemolish = (buildingType: BuildingType): boolean => {
    if (!planet.value) return false
    if (getBuildingLevel(buildingType) <= 0) return false

    // 檢查建造佇列是否已滿（只計算建築型別的佇列項）
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    const maxQueue = publicLogic.getMaxBuildQueue(planet.value, bonuses.additionalBuildQueue)
    const buildingQueueCount = planet.value.buildQueue.filter(item => item.type === 'building' || item.type === 'demolish').length
    if (buildingQueueCount >= maxQueue) {
      return false
    }

    return true
  }

  // 獲取拆除返還資源
  const getDemolishRefund = (buildingType: BuildingType): Resources => {
    const currentLevel = getBuildingLevel(buildingType)
    return buildingLogic.calculateDemolishRefund(buildingType, currentLevel)
  }

  // 檢查是否可以新增到等待佇列
  const canAddToWaitingQueue = (buildingType: BuildingType): boolean => {
    if (!planet.value) return false

    const config = BUILDINGS.value[buildingType]
    const currentLevel = getBuildingLevel(buildingType)

    // 計算目標等級：當前等級 + 正式佇列中的升級數 + 等待佇列中的升級數 + 1
    const upgradesInBuildQueue = planet.value.buildQueue.filter(q => q.type === 'building' && q.itemType === buildingType).length
    const waitingQueue = planet.value.waitingBuildQueue || []
    const upgradesInWaitingQueue = waitingQueue.filter(q => q.type === 'building' && q.itemType === buildingType).length
    const targetLevel = currentLevel + upgradesInBuildQueue + upgradesInWaitingQueue + 1

    // 檢查是否達到等級上限（使用計算後的目標等級）
    if (config.maxLevel !== undefined && targetLevel > config.maxLevel) {
      return false
    }

    // 檢查目標等級的前置條件是否滿足
    // 如果該建築已經在佇列中（正式或等待），說明基本條件已滿足，跳過檢查
    const alreadyInQueue = upgradesInBuildQueue > 0 || upgradesInWaitingQueue > 0
    if (!alreadyInQueue) {
      // 第一次新增時，檢查當前等級+1的前置條件
      if (!checkUpgradeRequirements(buildingType)) {
        return false
      }
    } else {
      // 後續新增時，檢查目標等級的前置條件
      const requirements = publicLogic.getLevelRequirements(config, targetLevel)
      if (requirements && Object.keys(requirements).length > 0) {
        if (!publicLogic.checkRequirements(planet.value, gameStore.player.technologies, requirements)) {
          return false
        }
      }
    }

    // 建築可以多次排隊（比如金屬礦升級到2、3、4、5級）
    // 只需要檢查等待佇列是否已滿
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    const maxWaitingQueue = waitingQueueLogic.getMaxBuildWaitingQueue(planet.value, bonuses.additionalBuildQueue)
    if (waitingQueue.length >= maxWaitingQueue) {
      return false
    }

    return true
  }

  // 新增到等待佇列
  const handleAddToWaiting = (buildingType: BuildingType, event: MouseEvent) => {
    if (!planet.value) return

    const currentLevel = getBuildingLevel(buildingType)

    // 計算目標等級：當前等級 + 正式佇列中的升級數 + 等待佇列中的升級數 + 1
    const upgradesInBuildQueue = planet.value.buildQueue.filter(q => q.type === 'building' && q.itemType === buildingType).length
    const waitingQueue = planet.value.waitingBuildQueue || []
    const upgradesInWaitingQueue = waitingQueue.filter(q => q.type === 'building' && q.itemType === buildingType).length
    const targetLevel = currentLevel + upgradesInBuildQueue + upgradesInWaitingQueue + 1

    const item = waitingQueueLogic.createBuildingWaitingItem(buildingType, targetLevel, planet.value.id)

    const result = waitingQueueLogic.canAddToBuildWaitingQueue(planet.value, item, gameStore.player.officers)
    if (!result.canAdd) {
      alertDialogTitle.value = t('queue.waitingQueueFull')
      alertDialogMessage.value = result.reason ? t(result.reason) : ''
      alertDialogShowRequirements.value = false
      alertDialogOpen.value = true
      return
    }

    // 觸發拋物線動畫
    triggerQueueAnimation(event, 'building')

    waitingQueueLogic.addToBuildWaitingQueue(planet.value, item)
  }
</script>
