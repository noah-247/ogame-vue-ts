<template>
  <div v-if="showWarning" class="bg-destructive/10 border-b border-destructive/20">
    <div class="px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
      <!-- 警告圖示和資訊 -->
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <Zap class="h-5 w-5 text-destructive shrink-0 animate-pulse" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-destructive">
            {{ t('energy.lowWarning') }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ detailMessage }}
          </p>
        </div>
      </div>

      <!-- 建造電站按鈕 -->
      <Button @click="goToBuildSolarPlant" variant="outline" size="sm" class="shrink-0">
        {{ t('energy.buildSolarPlant') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { getGameNow } from '@/logic/gameTime'
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { useGameStore } from '@/stores/gameStore'
  import { Button } from '@/components/ui/button'
  import { Zap } from 'lucide-vue-next'
  import { useI18n } from '@/composables/useI18n'
  import * as resourceLogic from '@/logic/resourceLogic'
  import * as officerLogic from '@/logic/officerLogic'

  const gameStore = useGameStore()
  const router = useRouter()
  const { t } = useI18n()

  // 獲取當前星球
  const planet = computed(() => gameStore.currentPlanet)

  // 計算能量產量
  const energyProduction = computed(() => {
    if (!planet.value) return 0
    const now = getGameNow()
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
    return resourceLogic.calculateEnergyProduction(planet.value, { energyProductionBonus: bonuses.energyProductionBonus })
  })

  // 計算能量消耗
  const energyConsumption = computed(() => {
    if (!planet.value) return 0
    return resourceLogic.calculateEnergyConsumption(planet.value)
  })

  // 是否顯示警告（電力產量 < 消耗）
  const showWarning = computed(() => {
    if (!planet.value) return false
    return energyProduction.value < energyConsumption.value
  })

  // 詳細訊息
  const detailMessage = computed(() => {
    const deficit = Math.ceil(energyConsumption.value - energyProduction.value)
    return t('energy.deficitDetail', { deficit: deficit.toString() })
  })

  // 跳轉到建築頁面建造太陽能電站
  const goToBuildSolarPlant = () => {
    router.push('/buildings')
  }
</script>
