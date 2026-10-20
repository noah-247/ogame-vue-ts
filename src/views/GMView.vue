<template>
  <!-- 無許可權時顯示404 -->
  <div v-if="!gameStore.player.isGMEnabled" class="container mx-auto p-4 sm:p-6 flex items-center justify-center min-h-[60vh]">
    <Empty class="border-0">
      <EmptyMedia>
        <div class="text-8xl sm:text-9xl font-bold text-muted-foreground/20">404</div>
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{{ t('notFound.title') }}</EmptyTitle>
        <EmptyDescription>{{ t('notFound.description') }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button @click="goHome" size="lg">
          <Home class="mr-2 h-4 w-4" />
          {{ t('notFound.goHome') }}
        </Button>
      </EmptyContent>
    </Empty>
  </div>

  <!-- 有許可權時顯示GM頁面 -->
  <div v-else class="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl sm:text-3xl font-bold">{{ t('gmView.title') }}</h1>
      <Badge variant="destructive">{{ t('gmView.adminOnly') }}</Badge>
    </div>

    <!-- 星球選擇 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('gmView.selectPlanet') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <Select v-model="selectedPlanetId">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('gmView.choosePlanet')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="planet in gameStore.player.planets" :key="planet.id" :value="planet.id">
              {{ planet.name }} ({{ planet.position.galaxy }}:{{ planet.position.system }}:{{ planet.position.position }})
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>

    <!-- 標籤切換 -->
    <Tabs v-if="selectedPlanet" default-value="resources" class="w-full">
      <TabsList class="grid w-full" :style="{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }">
        <TabsTrigger v-for="tab in tabs" :key="tab.value" :value="tab.value">
          {{ t(tab.label) }}
        </TabsTrigger>
      </TabsList>

      <!-- 資源 -->
      <TabsContent value="resources" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{{ t('gmView.modifyResources') }}</CardTitle>
            <CardDescription>{{ t('gmView.resourcesDesc') }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 一鍵拉滿按鈕 -->
            <Button @click="maxAllResources" variant="outline" class="w-full">
              {{ t('gmView.maxAllResources') }}
            </Button>

            <div v-for="resource in resourceTypes" :key="resource" class="space-y-2">
              <Label>{{ t(`resources.${resource}`) }}</Label>
              <div class="flex gap-2">
                <Input v-model.number="selectedPlanet.resources[resource]" type="number" min="0" class="flex-1" />
                <Button @click="setResourceAmount(resource, 1000000)" variant="outline" size="sm">+1M</Button>
                <Button @click="setResourceAmount(resource, 10000000)" variant="outline" size="sm">+10M</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- 建築/科技/艦船/防禦/軍官 - 統一配置渲染 -->
      <TabsContent v-for="section in gmSections" :key="section.tabValue" :value="section.tabValue" class="space-y-4">
        <!-- 預設操作區 -->
        <Card v-if="isPresettableSection(section)" class="mb-4">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg">{{ t('gmView.presets') || 'Presets' }}</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
              <div class="flex gap-2 w-full sm:w-auto">
                <Select v-model="selectedPresets[section.tabValue]">
                  <SelectTrigger class="w-[200px]">
                    <SelectValue :placeholder="t('gmView.choosePreset') || 'Choose Preset'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{{ t('gmView.defaultPreset') || 'Default Preset' }}</SelectItem>
                    <SelectItem v-for="p in customPresets[section.tabValue]" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button @click="handleApplyPreset(section)">{{ t('gmView.applyPreset') || 'Apply' }}</Button>
                <Button 
                  v-if="selectedPresets[section.tabValue] !== 'default'"
                  @click="handleDeletePreset(section)"
                  variant="destructive"
                  size="icon"
                  :title="t('gmView.deletePreset') || 'Delete Preset'"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
              <div class="flex gap-2 w-full sm:w-auto ml-auto">
                <Input v-model="presetNames[section.tabValue]" :placeholder="t('gmView.presetName') || 'Preset Name'" class="w-[150px]" />
                <Button @click="handleSavePreset(section)" variant="outline">{{ t('gmView.savePreset') || 'Save' }}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{{ t(section.titleKey) }}</CardTitle>
            <CardDescription>{{ t(section.descKey) }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="item in section.items" :key="item" class="space-y-2">
                <Label>{{ section.getItemName(item) }}</Label>
                <div class="flex gap-2">
                  <Input
                    :model-value="section.getValue(item)"
                    @update:model-value="section.setValue(item, Number($event) || 0)"
                    type="number"
                    :min="0"
                    :max="section.max"
                    :placeholder="section.placeholder"
                    class="flex-1"
                  />
                  <Button
                    v-for="btn in section.buttons"
                    :key="btn.label"
                    @click="section.onButtonClick(item, btn.value)"
                    variant="outline"
                    size="sm"
                  >
                    {{ btn.label }}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- NPC測試 -->
    <Card class="border-primary">
      <CardHeader>
        <CardTitle>{{ t('gmView.npcTesting') || 'NPC Testing' }}</CardTitle>
        <CardDescription>{{ t('gmView.npcTestingDesc') || 'Test NPC spy and attack behavior' }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label>{{ t('gmView.selectNPC') || 'Select NPC' }}</Label>
            <Select v-model="selectedNPCId">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('gmView.chooseNPC') || 'Choose NPC'" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="npc in npcStore.npcs" :key="npc.id" :value="npc.id">
                  {{ npc.name }} ({{ t(`diplomacy.diagnostic.difficultyLevels.${npc.difficulty}`) }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>{{ t('gmView.targetPlanet') || 'Target Planet' }}</Label>
            <Select v-model="targetPlanetIndex">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('gmView.chooseTarget') || 'Choose Target Planet'" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(planet, index) in gameStore.player.planets" :key="planet.id" :value="index.toString()">
                  {{ planet.name }} ({{ planet.position.galaxy }}:{{ planet.position.system }}:{{ planet.position.position }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <Button @click="testNPCSpy" variant="outline" class="w-full" :disabled="!selectedNPC">
            {{ t('gmView.testSpy') || 'Test Spy' }}
          </Button>
          <Button @click="testNPCAttack" variant="outline" class="w-full" :disabled="!selectedNPC">
            {{ t('gmView.testAttack') || 'Test Attack' }}
          </Button>
        </div>

        <Button @click="testNPCSpyAndAttack" variant="default" class="w-full" :disabled="!selectedNPC">
          {{ t('gmView.testSpyAndAttack') || 'Test Spy & Attack' }}
        </Button>

        <Button @click="initializeNPCFleet" variant="secondary" class="w-full" :disabled="!selectedNPC">
          {{ t('gmView.initializeFleet') || 'Initialize NPC Fleet' }}
        </Button>

        <Button @click="accelerateAllMissions" variant="secondary" class="w-full" :disabled="!selectedNPC">
          {{ t('gmView.accelerateMissions') || 'Accelerate All Missions (5s)' }}
        </Button>
      </CardContent>
    </Card>

    <!-- 佇列管理 -->
    <Card class="border-primary">
      <CardHeader>
        <CardTitle>{{ t('gmView.completeAllQueues') }}</CardTitle>
        <CardDescription>{{ t('gmView.completeAllQueuesDesc') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button @click="completeAllQueues" variant="default" class="w-full">{{ t('gmView.completeQueues') }}</Button>
      </CardContent>
    </Card>

    <!-- 危險操作 -->
    <Card class="border-destructive">
      <CardHeader>
        <CardTitle class="text-destructive">{{ t('gmView.dangerZone') }}</CardTitle>
        <CardDescription>{{ t('gmView.dangerZoneDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-2">
        <Button @click="showResetConfirmDialog" variant="destructive" class="w-full">{{ t('gmView.resetGame') }}</Button>
      </CardContent>
    </Card>

    <!-- Reset Game 確認對話方塊 -->
    <AlertDialog :open="resetDialogOpen" @update:open="handleResetDialogClose">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('gmView.resetGame') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('gmView.resetGameConfirm') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="handleResetCancel">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmResetGame">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 預設覆蓋確認對話方塊 -->
    <AlertDialog :open="presetOverwriteDialogOpen" @update:open="presetOverwriteDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('gmView.confirmOverwriteTitle') || 'Preset Already Exists' }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('gmView.confirmOverwriteMessage', { name: pendingPresetToOverwrite?.name || '' }) || `Preset with name "${pendingPresetToOverwrite?.name}" already exists. Overwrite?` }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="presetOverwriteDialogOpen = false">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="handleConfirmOverwrite">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- AlertDialog 提示對話方塊 -->
    <AlertDialog :open="alertDialogOpen" @update:open="alertDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ alertDialogTitle }}</AlertDialogTitle>
          <AlertDialogDescription v-if="alertDialogMessage" class="whitespace-pre-line">
            {{ alertDialogMessage }}
          </AlertDialogDescription>
          <AlertDialogDescription v-else class="sr-only">
            {{ alertDialogTitle }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="handleAlertConfirm">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
  import { getGameNow } from '@/logic/gameTime'
  import { ref, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { toast } from 'vue-sonner'
  import { useGameStore } from '@/stores/gameStore'
  import { useNPCStore } from '@/stores/npcStore'
  import { useUniverseStore } from '@/stores/universeStore'
  import { useI18n } from '@/composables/useI18n'
  import { useGameConfig } from '@/composables/useGameConfig'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Badge } from '@/components/ui/badge'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
  import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
  import { BuildingType, TechnologyType, ShipType, DefenseType, OfficerType } from '@/types/game'
  import * as npcBehaviorLogic from '@/logic/npcBehaviorLogic'
  import * as publicLogic from '@/logic/publicLogic'
  import { calculateMaxFleetStorage } from '@/logic/fleetStorageLogic'
  import { calculateMissileSiloCapacity } from '@/logic/missileLogic'
  import { generateId } from '@/utils/id'
  import { Home, Trash2 } from 'lucide-vue-next'

  // --- 預設系統 ---
  interface GMPreset {
    id: string
    name: string
    values: Record<string, number>
  }

  type GMSectionTabValue = 'buildings' | 'research' | 'ships' | 'defense' | 'officers'
  type GMPresetSectionKey = Exclude<GMSectionTabValue, 'officers'>

  type GMSection = {
    tabValue: GMSectionTabValue
    titleKey: string
    descKey: string
    items: string[]
    max?: number
    placeholder?: string
    buttons: { label: string; value: number }[]
    getItemName: (item: string) => string
    getValue: (item: string) => number
    setValue: (item: string, val: number) => void
    onButtonClick: (item: string, val: number) => void
  }

  type GMPresetSection = GMSection & {
    tabValue: GMPresetSectionKey
  }

  type GMPresetNameMap = Record<GMPresetSectionKey, string>
  type GMSelectedPresetMap = Record<GMPresetSectionKey, string>
  type GMCustomPresetMap = Record<GMPresetSectionKey, GMPreset[]>

  interface PendingPresetOverwrite {
    section: GMPresetSection
    name: string
    values: Record<string, number>
    existingIndex: number
  }

  // 校驗預設結構，避免歷史髒資料汙染當前檢視
  const isGMPreset = (value: unknown): value is GMPreset => {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const preset = value as Partial<GMPreset>
    return typeof preset.id === 'string' && typeof preset.name === 'string' && typeof preset.values === 'object' && preset.values !== null
  }

  // 只有建築/科技/艦船/防禦頁支援預設
  const isPresettableSection = (section: GMSection): section is GMPresetSection => {
    return section.tabValue !== 'officers'
  }

  const presetOverwriteDialogOpen = ref(false)
  const pendingPresetToOverwrite = ref<PendingPresetOverwrite | null>(null)

  const getPresets = (type: GMPresetSectionKey): GMPreset[] => {
    const key = `gm_presets_${type}`
    const data = localStorage.getItem(key)
    if (!data) {
      return []
    }

    try {
      // 相容舊版本或手動修改導致的損壞資料，避免頁面因解析失敗崩潰
      const parsed = JSON.parse(data)
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(key)
        return []
      }

      const presets = parsed.filter(isGMPreset)
      // 過濾掉結構不完整的預設，並順手回寫清理後的結果
      if (presets.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(presets))
      }

      return presets
    } catch {
      localStorage.removeItem(key)
      return []
    }
  }

  const savePresets = (type: GMPresetSectionKey, presets: GMPreset[]) => {
    localStorage.setItem(`gm_presets_${type}`, JSON.stringify(presets))
  }

  const presetNames = ref<GMPresetNameMap>({
    buildings: '',
    research: '',
    ships: '',
    defense: ''
  })

  const selectedPresets = ref<GMSelectedPresetMap>({
    buildings: 'default',
    research: 'default',
    ships: 'default',
    defense: 'default'
  })

  const customPresets = ref<GMCustomPresetMap>({
    buildings: getPresets('buildings'),
    research: getPresets('research'),
    ships: getPresets('ships'),
    defense: getPresets('defense')
  })

  const handleSavePreset = (section: GMSection) => {
    if (!isPresettableSection(section)) return

    const name = presetNames.value[section.tabValue]?.trim()
    if (!name) {
      toast.error(t('gmView.presetNameRequired') || '請輸入預設名稱')
      return
    }
    
    const values: Record<string, number> = {}
    section.items.forEach((item: string) => {
      values[item] = section.getValue(item)
    })

    // 檢查是否存在同名預設
    const presets = customPresets.value[section.tabValue]
    const existingIndex = presets.findIndex(p => p.name === name)
    
    if (existingIndex !== -1) {
      pendingPresetToOverwrite.value = {
        section,
        name,
        values,
        existingIndex
      }
      presetOverwriteDialogOpen.value = true
      return
    }
    
    const newPreset: GMPreset = {
      id: generateId('gm_preset'),
      name,
      values
    }
    
    presets.push(newPreset)
    savePresets(section.tabValue, presets)
    presetNames.value[section.tabValue] = ''
    selectedPresets.value[section.tabValue] = newPreset.id
    toast.success(t('gmView.presetSaved') || '預設儲存成功')
  }

  const handleConfirmOverwrite = () => {
    if (!pendingPresetToOverwrite.value) return
    
    const { section, values, existingIndex } = pendingPresetToOverwrite.value
    
    const presets = customPresets.value[section.tabValue]

    if (presets[existingIndex]) {
      // 更新現有預設的值，保持ID不變
      presets[existingIndex].values = values

      savePresets(section.tabValue, presets)

      presetNames.value[section.tabValue] = ''
      selectedPresets.value[section.tabValue] = presets[existingIndex].id

      toast.success(t('gmView.presetSaved') || '預設儲存成功')
    }
    
    presetOverwriteDialogOpen.value = false
    pendingPresetToOverwrite.value = null
  }

  const handleDeletePreset = (section: GMSection) => {
    if (!isPresettableSection(section)) return

    const presetId = selectedPresets.value[section.tabValue]
    if (!presetId || presetId === 'default') {
      toast.error(t('gmView.cannotDeleteDefault') || '無法刪除內建預設')
      return
    }
    
    const presets = customPresets.value[section.tabValue]
    const index = presets.findIndex(p => p.id === presetId)
    
    if (index !== -1) {
      presets.splice(index, 1)
      savePresets(section.tabValue, presets)
      selectedPresets.value[section.tabValue] = 'default'
      toast.success(t('gmView.presetDeleted') || '預設已刪除')
    }
  }

  const handleApplyPreset = (section: GMSection) => {
    if (!isPresettableSection(section)) return

    const presetId = selectedPresets.value[section.tabValue]
    if (!presetId) return

    if (presetId === 'default') {
      if (section.tabValue === 'buildings') {
        const explicitMax: Record<string, number> = {
          [BuildingType.NaniteFactory]: 10,
          [BuildingType.MissileSilo]: 10,
          [BuildingType.JumpGate]: 5,
          [BuildingType.PlanetDestroyerFactory]: 3,
          [BuildingType.GeoResearchStation]: 10,
          [BuildingType.DeepDrillingFacility]: 10,
          [BuildingType.University]: 10
        }
        section.items.forEach((item: string) => {
          section.setValue(item, explicitMax[item] || 50)
        })
      } else if (section.tabValue === 'research') {
        const explicitMax: Record<string, number> = {
          [TechnologyType.ComputerTechnology]: 10,
          [TechnologyType.GravitonTechnology]: 1,
          [TechnologyType.PlanetDestructionTech]: 10,
          [TechnologyType.MiningTechnology]: 15,
          [TechnologyType.IntergalacticResearchNetwork]: 10,
          [TechnologyType.MineralResearch]: 20,
          [TechnologyType.CrystalResearch]: 20,
          [TechnologyType.FuelResearch]: 20
        }
        section.items.forEach((item: string) => {
          section.setValue(item, explicitMax[item] || 100)
        })
      } else if (section.tabValue === 'ships') {
        if (!selectedPlanet.value) return
        // 某些過濾場景下艦船列表可能為空，避免平均分配時除以 0
        if (!section.items.length) return
        
        // 重新計算最大艦隊倉儲，確保資料是最新的
        const maxStorage = calculateMaxFleetStorage(selectedPlanet.value, gameStore.player.technologies)

        // 將總容量平均分配給每種艦船
        const storagePerShip = maxStorage / section.items.length

        section.items.forEach(item => {
          const usage = SHIPS.value[item as ShipType]?.storageUsage || 1
          // 如果 usage 為 0 (如某些特殊單位)，則給予一個預設數量，或者跳過
          if (usage <= 0) {
             section.setValue(item, 100) // 防止除以0，給予固定值
          } else {
             section.setValue(item, Math.floor(storagePerShip / usage))
          }
        })
      } else if (section.tabValue === 'defense') {
        if (!selectedPlanet.value) return
        const missileCapacity = calculateMissileSiloCapacity(selectedPlanet.value.buildings)
        const defaultMissileCount = Math.floor(missileCapacity / 2)

        section.items.forEach((item: string) => {
          // 兩種導彈都佔用1格空間，預設各分配一半容量
          if (item === DefenseType.AntiBallisticMissile || item === DefenseType.InterplanetaryMissile) {
            section.setValue(item, defaultMissileCount)
          } else {
            section.setValue(item, 10000)
          }
        })
      }
      toast.success(t('gmView.presetApplied') || '內建預設套用成功')
    } else {
      const customPreset = customPresets.value[section.tabValue].find((p: GMPreset) => p.id === presetId)
      if (customPreset) {
        Object.entries(customPreset.values).forEach(([k, v]) => {
          section.setValue(k, v as number)
        })
        toast.success(t('gmView.presetApplied') || '預設套用成功')
      }
    }
  }
  // --- 預設系統結束 ---

  const router = useRouter()
  const gameStore = useGameStore()
  const npcStore = useNPCStore()
  const universeStore = useUniverseStore()
  const { t } = useI18n()
  const { BUILDINGS, TECHNOLOGIES, SHIPS, DEFENSES, OFFICERS } = useGameConfig()

  // 更新玩家積分的輔助函式
  const updatePlayerPoints = () => {
    gameStore.player.points = publicLogic.calculatePlayerPoints(gameStore.player)
  }

  const goHome = () => {
    router.push('/')
  }

  // 預設選中當前正在遊玩的星球
  const selectedPlanetId = ref<string>(gameStore.currentPlanetId || gameStore.player.planets[0]?.id || '')
  const officerDays = ref<Record<OfficerType, number>>({} as Record<OfficerType, number>)
  const selectedNPCId = ref<string>(npcStore.npcs[0]?.id || '')
  const targetPlanetIndex = ref<string>('0')

  // AlertDialog 狀態
  const alertDialogOpen = ref(false)
  const alertDialogTitle = ref('')
  const alertDialogMessage = ref('')
  const alertDialogCallback = ref<(() => void) | null>(null)

  // Reset Dialog 狀態
  const resetDialogOpen = ref(false)

  // 初始化軍官天數顯示
  Object.values(OfficerType).forEach(officer => {
    const officerData = gameStore.player.officers[officer]
    if (officerData && officerData.expiresAt) {
      const daysLeft = Math.ceil((officerData.expiresAt - getGameNow()) / (1000 * 60 * 60 * 24))
      officerDays.value[officer] = Math.max(0, daysLeft)
    } else {
      officerDays.value[officer] = 0
    }
  })

  const selectedPlanet = computed(() => {
    return gameStore.player.planets.find(p => p.id === selectedPlanetId.value)
  })

  const selectedNPC = computed(() => {
    return npcStore.npcs.find(npc => npc.id === selectedNPCId.value)
  })

  const allPlanets = computed(() => {
    return [...gameStore.player.planets, ...Object.values(universeStore.planets)]
  })

  const resourceTypes = ['metal', 'crystal', 'deuterium', 'darkMatter'] as const

  // Tab配置
  const tabs = [
    { value: 'resources' as const, label: 'gmView.resources' },
    { value: 'buildings' as const, label: 'gmView.buildings' },
    { value: 'research' as const, label: 'gmView.research' },
    { value: 'ships' as const, label: 'gmView.ships' },
    { value: 'defense' as const, label: 'gmView.defense' },
    { value: 'officers' as const, label: 'gmView.officers' }
  ]

  const setResourceAmount = (resource: string, amount: number) => {
    if (selectedPlanet.value) {
      selectedPlanet.value.resources[resource as keyof typeof selectedPlanet.value.resources] += amount
    }
  }

  const gmSections = computed<GMSection[]>(() => [
    {
      tabValue: 'buildings',
      titleKey: 'gmView.modifyBuildings',
      descKey: 'gmView.buildingsDesc',
      items: Object.values(BuildingType),
      max: 100,
      placeholder: undefined,
      buttons: [
        { label: 'Lv 10', value: 10 },
        { label: 'Lv 30', value: 30 }
      ],
      getItemName: item => BUILDINGS.value[item as BuildingType].name,
      getValue: item => selectedPlanet.value?.buildings[item as BuildingType] || 0,
      setValue: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.buildings[item as BuildingType] = val
          updatePlayerPoints()
        }
      },
      onButtonClick: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.buildings[item as BuildingType] = val
          updatePlayerPoints()
        }
      }
    },
    {
      tabValue: 'research',
      titleKey: 'gmView.modifyResearch',
      descKey: 'gmView.researchDesc',
      items: Object.values(TechnologyType),
      max: 50,
      placeholder: undefined,
      buttons: [
        { label: 'Lv 10', value: 10 },
        { label: 'Lv 20', value: 20 }
      ],
      getItemName: item => TECHNOLOGIES.value[item as TechnologyType].name,
      getValue: item => gameStore.player.technologies[item as TechnologyType] || 0,
      setValue: (item, val) => {
        gameStore.player.technologies[item as TechnologyType] = val
        updatePlayerPoints()
      },
      onButtonClick: (item, val) => {
        gameStore.player.technologies[item as TechnologyType] = val
        updatePlayerPoints()
      }
    },
    {
      tabValue: 'ships',
      titleKey: 'gmView.modifyShips',
      descKey: 'gmView.shipsDesc',
      items: Object.values(ShipType),
      max: undefined,
      placeholder: undefined,
      buttons: [
        { label: '+100', value: 100 },
        { label: '+1K', value: 1000 }
      ],
      getItemName: item => SHIPS.value[item as ShipType].name,
      getValue: item => selectedPlanet.value?.fleet[item as ShipType] || 0,
      setValue: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.fleet[item as ShipType] = val
          updatePlayerPoints()
        }
      },
      onButtonClick: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.fleet[item as ShipType] = (selectedPlanet.value.fleet[item as ShipType] || 0) + val
          updatePlayerPoints()
        }
      }
    },
    {
      tabValue: 'defense',
      titleKey: 'gmView.modifyDefense',
      descKey: 'gmView.defenseDesc',
      items: Object.values(DefenseType),
      max: undefined,
      placeholder: undefined,
      buttons: [
        { label: '+100', value: 100 },
        { label: '+1K', value: 1000 }
      ],
      getItemName: item => DEFENSES.value[item as DefenseType].name,
      getValue: item => selectedPlanet.value?.defense[item as DefenseType] || 0,
      setValue: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.defense[item as DefenseType] = val
          updatePlayerPoints()
        }
      },
      onButtonClick: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.defense[item as DefenseType] = (selectedPlanet.value.defense[item as DefenseType] || 0) + val
          updatePlayerPoints()
        }
      }
    },
    {
      tabValue: 'officers',
      titleKey: 'gmView.modifyOfficers',
      descKey: 'gmView.officersDesc',
      items: Object.values(OfficerType),
      max: undefined,
      placeholder: t('gmView.days'),
      buttons: [
        { label: `7${t('gmView.days')}`, value: 7 },
        { label: `30${t('gmView.days')}`, value: 30 },
        { label: `365${t('gmView.days')}`, value: 365 }
      ],
      getItemName: item => OFFICERS.value[item as OfficerType].name,
      getValue: item => officerDays.value[item as OfficerType] || 0,
      setValue: (item, val) => {
        officerDays.value[item as OfficerType] = val
      },
      onButtonClick: (item, days) => {
        const officerType = item as OfficerType
        officerDays.value[officerType] = days
        const now = getGameNow()
        const expiresAt = now + days * 24 * 60 * 60 * 1000
        if (!gameStore.player.officers[officerType]) {
          gameStore.player.officers[officerType] = {
            type: officerType,
            active: true,
            hiredAt: now,
            expiresAt: expiresAt
          }
        } else {
          gameStore.player.officers[officerType].expiresAt = expiresAt
          gameStore.player.officers[officerType].active = true
          if (!gameStore.player.officers[officerType].hiredAt) {
            gameStore.player.officers[officerType].hiredAt = now
          }
        }
      }
    }
  ])

  // 顯示重置遊戲確認對話方塊
  const showResetConfirmDialog = () => {
    // 暫停遊戲
    gameStore.isPaused = true
    resetDialogOpen.value = true
  }

  // 處理重置對話方塊關閉
  const handleResetDialogClose = (open: boolean) => {
    if (!open) {
      // 如果對話方塊關閉，恢復遊戲
      gameStore.isPaused = false
    }
    resetDialogOpen.value = open
  }

  // 取消重置
  const handleResetCancel = () => {
    resetDialogOpen.value = false
    gameStore.isPaused = false
  }

  // 確認重置遊戲
  const confirmResetGame = () => {
    gameStore.isPaused = true
    resetDialogOpen.value = false
    try {
      gameStore.player.isGMEnabled = false
      localStorage.clear()
      location.reload()
    } catch (error) {
      console.error('Failed to reset game:', error)
      window.location.reload()
    }
  }

  // 顯示AlertDialog的輔助函式
  const showAlert = (title: string, message: string, callback?: () => void) => {
    alertDialogTitle.value = title
    alertDialogMessage.value = message
    alertDialogCallback.value = callback || null
    alertDialogOpen.value = true
  }

  // AlertDialog確認處理
  const handleAlertConfirm = () => {
    alertDialogOpen.value = false
    if (alertDialogCallback.value) {
      alertDialogCallback.value()
      alertDialogCallback.value = null
    }
  }

  // NPC測試函式
  const testNPCSpy = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const mission = npcBehaviorLogic.forceNPCSpyPlayer(
      selectedNPC.value,
      gameStore.player,
      allPlanets.value,
      parseInt(targetPlanetIndex.value)
    )

    if (mission) {
      showAlert(t('gmView.npcWillSpyIn5s', { npcName: selectedNPC.value.name }), t('gmView.testSpyMessage'), () => {
        // 加速任務到5秒後到達（在確認後執行，這樣時間更準確）
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, mission.id, 5, gameStore.player)
      })
    } else {
      showAlert(t('gmView.npcNoProbes') || 'NPC does not have spy probes', '')
    }
  }

  const testNPCAttack = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const mission = npcBehaviorLogic.forceNPCAttackPlayer(
      selectedNPC.value,
      gameStore.player,
      allPlanets.value,
      parseInt(targetPlanetIndex.value)
    )

    if (mission) {
      showAlert(t('gmView.npcWillAttackIn5s', { npcName: selectedNPC.value.name }), t('gmView.testAttackMessage'), () => {
        // 加速任務到5秒後到達（在確認後執行，這樣時間更準確）
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, mission.id, 5, gameStore.player)
      })
    } else {
      showAlert(t('gmView.npcNoSpyReport') || 'NPC needs to spy first', '')
    }
  }

  const testNPCSpyAndAttack = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const { spyMission, attackMission } = npcBehaviorLogic.forceNPCSpyAndAttack(
      selectedNPC.value,
      gameStore.player,
      allPlanets.value,
      parseInt(targetPlanetIndex.value)
    )

    if (spyMission && attackMission) {
      showAlert(t('gmView.npcWillSpyAndAttack', { npcName: selectedNPC.value.name }), t('gmView.testSpyAndAttackMessage'), () => {
        // 加速任務：偵查5秒後到達，攻擊10秒後到達（在確認後執行，這樣時間更準確）
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, spyMission.id, 5, gameStore.player)
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, attackMission.id, 10, gameStore.player)
      })
    } else {
      showAlert(t('gmView.npcMissionFailed') || 'Failed to create missions', '')
    }
  }

  const accelerateAllMissions = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const count = npcBehaviorLogic.accelerateAllNPCMissions(selectedNPC.value, 5, gameStore.player)
    showAlert(t('gmView.acceleratedMissions', { count }), '')
  }

  // 初始化NPC艦隊
  const initializeNPCFleet = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    // 給NPC的第一個星球新增基礎艦隊
    const npcPlanet = selectedNPC.value.planets[0]
    if (!npcPlanet) {
      showAlert(t('gmView.npcNoPlanets'), '')
      return
    }

    // 新增間諜探測器
    npcPlanet.fleet[ShipType.EspionageProbe] = (npcPlanet.fleet[ShipType.EspionageProbe] || 0) + 100

    // 新增戰鬥艦船
    npcPlanet.fleet[ShipType.LightFighter] = (npcPlanet.fleet[ShipType.LightFighter] || 0) + 500
    npcPlanet.fleet[ShipType.HeavyFighter] = (npcPlanet.fleet[ShipType.HeavyFighter] || 0) + 300
    npcPlanet.fleet[ShipType.Cruiser] = (npcPlanet.fleet[ShipType.Cruiser] || 0) + 200
    npcPlanet.fleet[ShipType.Battleship] = (npcPlanet.fleet[ShipType.Battleship] || 0) + 100
    npcPlanet.fleet[ShipType.Bomber] = (npcPlanet.fleet[ShipType.Bomber] || 0) + 50
    npcPlanet.fleet[ShipType.Destroyer] = (npcPlanet.fleet[ShipType.Destroyer] || 0) + 30
    npcPlanet.fleet[ShipType.Battlecruiser] = (npcPlanet.fleet[ShipType.Battlecruiser] || 0) + 20

    showAlert(t('gmView.npcFleetInitialized', { npcName: selectedNPC.value.name }), t('gmView.npcFleetDetails'))
  }

  // 一鍵拉滿所有資源
  const maxAllResources = () => {
    if (!selectedPlanet.value) return

    // 計算當前星球的資源儲存上限
    const capacity = publicLogic.getResourceCapacity(selectedPlanet.value, gameStore.player.officers)

    selectedPlanet.value.resources.metal = capacity.metal
    selectedPlanet.value.resources.crystal = capacity.crystal
    selectedPlanet.value.resources.deuterium = capacity.deuterium
    selectedPlanet.value.resources.darkMatter = capacity.darkMatter

    toast.success(t('gmView.maxAllResourcesSuccess'))
  }

  // 一鍵完成所有佇列和任務
  const completeAllQueues = () => {
    const now = getGameNow()
    let buildingCount = 0
    let researchCount = 0
    let missionCount = 0
    let missileCount = 0

    // 完成所有星球的建築佇列
    gameStore.player.planets.forEach(planet => {
      planet.buildQueue.forEach(item => {
        if (item.endTime > now) {
          // 根據佇列型別完成建築/拆除/艦船/防禦
          if (item.type === 'building') {
            planet.buildings[item.itemType as BuildingType] = item.targetLevel || 0
          } else if (item.type === 'demolish') {
            planet.buildings[item.itemType as BuildingType] = item.targetLevel || 0
          } else if (item.type === 'ship') {
            planet.fleet[item.itemType as ShipType] = (planet.fleet[item.itemType as ShipType] || 0) + (item.quantity || 0)
          } else if (item.type === 'defense') {
            planet.defense[item.itemType as DefenseType] = (planet.defense[item.itemType as DefenseType] || 0) + (item.quantity || 0)
          }
          buildingCount++
        }
      })
      planet.buildQueue = []
    })

    // 完成科技佇列
    gameStore.player.researchQueue.forEach(item => {
      if (item.endTime > now && item.type === 'technology') {
        gameStore.player.technologies[item.itemType as TechnologyType] = item.targetLevel || 0
        researchCount++
      }
    })
    gameStore.player.researchQueue = []

    // 完成所有飛行任務（設定到達時間為現在，讓遊戲邏輯自動處理）
    gameStore.player.fleetMissions.forEach(mission => {
      if (mission.status === 'outbound') {
        // 計算原始飛行時間
        const originalFlightTime = mission.arrivalTime - mission.departureTime
        // 將到達時間設定為現在減1毫秒，確保遊戲邏輯能立即檢測到
        mission.arrivalTime = now - 1
        // 同時更新返回時間為：現在 + 原始飛行時間 - 1毫秒
        mission.returnTime = now + originalFlightTime - 1
        missionCount++
      } else if (mission.status === 'returning') {
        // 返航中的任務設定返回時間為現在減1毫秒，確保遊戲邏輯能立即檢測到
        if (mission.returnTime) {
          mission.returnTime = now - 1
        }
        missionCount++
      } else if (mission.status === 'arrived') {
        // 修復卡在 arrived 狀態的任務
        // 將狀態改為 returning 並設定返回時間為現在
        mission.status = 'returning'
        mission.returnTime = now - 1
        missionCount++
      }
    })

    // 完成所有NPC任務
    npcStore.npcs.forEach(npc => {
      if (npc.fleetMissions) {
        npc.fleetMissions.forEach(mission => {
          if (mission.status === 'outbound') {
            const originalFlightTime = mission.arrivalTime - mission.departureTime
            mission.arrivalTime = now - 1
            mission.returnTime = now + originalFlightTime - 1
          } else if (mission.status === 'returning' && mission.returnTime) {
            mission.returnTime = now - 1
          }
        })
      }
    })

    // 完成所有導彈攻擊（設定到達時間為現在，讓遊戲邏輯自動處理）
    gameStore.player.missileAttacks.forEach(attack => {
      if (attack.status === 'flying') {
        attack.arrivalTime = now - 1
        missileCount++
      }
    })

    // 更新玩家積分（因為建築/科技/艦隊/防禦可能已改變）
    updatePlayerPoints()

    toast.success(
      t('gmView.completeQueuesSuccess', {
        buildingCount,
        researchCount,
        missionCount,
        missileCount
      })
    )
  }
</script>
