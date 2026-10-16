<template>
  <div class="container mx-auto p-4 sm:p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ t('autopilot.title') }}</h1>
      <span v-if="planet" class="text-sm text-muted-foreground">{{ t('autopilot.planet') }}: {{ planet.name }}</span>
    </div>

    <div v-if="!planet || !config" class="text-muted-foreground">—</div>
    <template v-else>
      <!-- 状态 -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t('autopilot.status') }}</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <Switch :checked="config.enabled" @update:checked="toggleEnabled" />
            <span class="text-sm font-medium">{{ t('autopilot.enabled') }}</span>
            <Badge v-if="!config.enabled || config.paused" variant="outline">{{ t('autopilot.paused') }}</Badge>
            <Badge v-else-if="config.mode === 'execute' && config.downgradeReason" variant="destructive">{{ t('autopilot.downgraded') }}</Badge>
            <Badge v-else-if="config.mode === 'auto'" variant="default">{{ t('autopilot.modeAuto') }}</Badge>
            <Badge v-else variant="secondary">{{ t('autopilot.modeExecute') }}</Badge>
          </div>

          <p v-if="config.downgradeReason" class="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle class="h-4 w-4" />
            {{ t('autopilot.downgradeReason') }}: {{ t(config.downgradeReason) }}
          </p>
          <p v-if="config.canResumeAuto" class="text-sm text-muted-foreground">
            {{ t('autopilot.canResumeAuto') }}
          </p>

          <div class="flex flex-wrap gap-2">
            <Button v-if="config.canResumeAuto" size="sm" @click="onResumeAuto">
              <Play class="mr-2 h-4 w-4" />{{ t('autopilot.resumeAuto') }}
            </Button>
            <!-- MAJ-5：执行模式下只保留「恢复自主」（受 canResumeAuto 守卫），
                 不提供无条件手动切回，避免绕过 B8 滞后区间 -->
            <Button v-if="config.enabled && config.mode === 'auto'" size="sm" variant="outline" @click="onSwitchMode('execute')">
              {{ t('autopilot.switchToExecute') }}
            </Button>
            <Button v-if="config.enabled && !config.paused" size="sm" variant="outline" @click="config.paused = true">
              <Pause class="mr-2 h-4 w-4" />{{ t('autopilot.pause') }}
            </Button>
            <Button v-if="config.enabled && config.paused" size="sm" variant="outline" @click="config.paused = false">
              <Play class="mr-2 h-4 w-4" />{{ t('autopilot.resume') }}
            </Button>
            <Button v-if="config.enabled" size="sm" variant="outline" @click="onTakeOver">
              {{ t('autopilot.takeOver') }}
            </Button>
          </div>

          <div class="text-sm space-y-1">
            <p><span class="text-muted-foreground">{{ t('autopilot.lastDecision') }}: </span>{{ t(config.lastDecision ?? 'autopilot.decisionIdle') }}</p>
            <div v-if="lastBlockers.length > 0">
              <p class="text-muted-foreground">{{ t('autopilot.blockers') }}:</p>
              <ul class="list-disc list-inside text-destructive/90">
                <li v-for="(b, i) in lastBlockers" :key="i">{{ t(b.reason) }}（{{ blockerLabel(b) }}）</li>
              </ul>
            </div>
            <p v-else class="text-muted-foreground">{{ t('autopilot.blockers') }}: {{ t('autopilot.noBlockers') }}</p>
          </div>
        </CardContent>
      </Card>

      <!-- 目标清单 -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t('autopilot.targets') }}</CardTitle>
          <CardDescription>{{ t('autopilot.modeAutoDesc') }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <div class="space-y-1">
              <Label>{{ t('autopilot.addTarget') }}</Label>
              <Select v-model="newTargetBuilding">
                <SelectTrigger class="w-[180px]">
                  <SelectValue :placeholder="t('autopilot.addTarget')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="bt in availableBuildings" :key="bt" :value="bt">
                    {{ t(`buildings.${bt}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1">
              <Label>{{ t('autopilot.targetLevel') }}</Label>
              <Input v-model.number="newTargetLevel" type="number" min="1" max="60" class="w-[100px]" />
            </div>
            <Button size="sm" :disabled="!newTargetBuilding" @click="addTarget">
              <Plus class="mr-2 h-4 w-4" />{{ t('autopilot.addTarget') }}
            </Button>
          </div>

          <div v-if="sortedTargets.length === 0" class="text-sm text-muted-foreground">
            {{ t('autopilot.noTargets') }}
          </div>
          <div
            v-for="(target, i) in sortedTargets"
            :key="target.id"
            draggable="true"
            @dragstart="onDragStart(i)"
            @dragover.prevent
            @drop="onDrop(i)"
            class="flex items-center gap-2 p-2 border rounded-lg bg-card"
            :class="{ 'opacity-50': dragIndex === i }"
          >
            <GripVertical class="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
            <span class="text-xs text-muted-foreground w-6 text-center">{{ i + 1 }}</span>
            <span class="font-medium flex-1 min-w-0 truncate">{{ t(`buildings.${target.buildingType}`) }}</span>
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ t('autopilot.currentLevel') }} {{ planet.buildings[target.buildingType] || 0 }}
            </span>
            <!-- BLK-4：草稿+失焦提交+夹值，避免打字途中被 B12 重推删掉 -->
            <Input
              :model-value="target.targetLevel"
              type="number"
              :min="(planet.buildings[target.buildingType] || 0) + 1"
              max="60"
              class="w-[80px]"
              :aria-label="t('autopilot.targetLevel')"
              @change="(e: Event) => commitTargetLevel(target, (e.target as HTMLInputElement).value)"
            />
            <div class="flex gap-1">
              <Button size="icon" variant="ghost" :disabled="i === 0" @click="moveTarget(i, -1)">
                <ChevronUp class="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" :disabled="i === sortedTargets.length - 1" @click="moveTarget(i, 1)">
                <ChevronDown class="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" @click="removeTarget(target.id)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 蓝图 -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t('autopilot.blueprints.title') }}</CardTitle>
        </CardHeader>
        <CardContent class="grid sm:grid-cols-2 gap-3">
          <div v-for="bp in blueprints" :key="bp.id" class="flex items-center justify-between p-3 border rounded-lg gap-2">
            <div class="space-y-1 min-w-0">
              <p class="font-medium">{{ t(bp.nameKey) }}</p>
              <p class="text-xs text-muted-foreground">{{ t(bp.descKey) }}</p>
            </div>
            <Button size="sm" variant="outline" @click="openBlueprintPreview(bp.id)">
              {{ t('autopilot.blueprints.apply') }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- 蓝图预览：展示整条待补前置链（B4），确认后套用 -->
      <Dialog v-model:open="blueprintPreviewOpen">
        <ScrollableDialogContent container-class="max-w-2xl">
          <template #header>
            <DialogTitle>{{ t('autopilot.blueprintPreviewTitle') }}</DialogTitle>
            <DialogDescription>
              {{ previewBlueprint ? t(previewBlueprint.nameKey) : '' }}
            </DialogDescription>
          </template>
          <div class="space-y-3 py-2">
            <div v-for="pv in blueprintChainPreview" :key="pv.target.buildingType" class="p-2 border rounded-lg space-y-1">
              <div class="flex items-center justify-between gap-2">
                <p class="font-medium text-sm">
                  {{ t(`buildings.${pv.target.buildingType}`) }} → {{ pv.target.targetLevel }}
                </p>
                <Badge v-if="pv.incompatible" variant="destructive" class="text-xs">{{ t('autopilot.blueprintIncompatible') }}</Badge>
              </div>
              <p v-if="!pv.incompatible && pv.chain.length === 0" class="text-xs text-muted-foreground">
                {{ t('autopilot.blueprintChainEmpty') }}
              </p>
              <ul v-else-if="!pv.incompatible" class="text-xs text-muted-foreground list-disc list-inside">
                <li v-for="(step, si) in pv.chain" :key="si">
                  {{ t(`buildings.${step.buildingType}`) }} → {{ step.level }}
                  <span v-if="step.blockedByTech">（{{ t('autopilot.blockedByTech') }}：{{ t(`technologies.${step.blockedByTech.technology}`) }} {{ step.blockedByTech.level }}）</span>
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="blueprintPreviewOpen = false">{{ t('common.cancel') }}</Button>
            <Button @click="confirmApplyBlueprint">{{ t('common.confirm') }}</Button>
          </DialogFooter>
        </ScrollableDialogContent>
      </Dialog>

      <!-- 配置 -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t('autopilot.reserve') }}</CardTitle>
          <CardDescription>{{ t('autopilot.reserveDesc') }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap gap-4">
            <div class="space-y-1">
              <Label>{{ t('resources.metal') }}</Label>
              <Input v-model.number="config.reserve.metal" type="number" min="0" class="w-[140px]" />
            </div>
            <div class="space-y-1">
              <Label>{{ t('resources.crystal') }}</Label>
              <Input v-model.number="config.reserve.crystal" type="number" min="0" class="w-[140px]" />
            </div>
            <div class="space-y-1">
              <Label>{{ t('resources.deuterium') }}</Label>
              <Input v-model.number="config.reserve.deuterium" type="number" min="0" class="w-[140px]" />
            </div>
          </div>
          <div class="flex flex-wrap gap-4 items-end">
            <div class="space-y-1">
              <Label>{{ t('autopilot.workHourThreshold') }}</Label>
              <Select :model-value="String(config.workHourThreshold)" @update:model-value="v => (config!.workHourThreshold = Number(v))">
                <SelectTrigger class="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7200">{{ t('autopilot.threshold2h') }}</SelectItem>
                  <SelectItem value="14400">{{ t('autopilot.threshold4h') }}</SelectItem>
                  <SelectItem value="28800">{{ t('autopilot.threshold8h') }}</SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground max-w-[280px]">{{ t('autopilot.workHourThresholdDesc') }}</p>
            </div>
            <div class="space-y-1">
              <Label>{{ t('autopilot.minFreeSpace') }}</Label>
              <Input v-model.number="config.minFreeSpace" type="number" min="0" class="w-[100px]" />
              <p class="text-xs text-muted-foreground">{{ t('autopilot.minFreeSpaceDesc') }}</p>
            </div>
            <div class="flex items-center gap-2">
              <Switch :checked="config.allowPrereqAutoBuild" @update:checked="v => (config!.allowPrereqAutoBuild = v)" />
              <Label class="text-sm">{{ t('autopilot.allowPrereqAutoBuild') }}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 离线说明 -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Info class="h-4 w-4" />{{ t('autopilot.offlineNoticeTitle') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground">{{ t('autopilot.offlineNotice') }}</p>
        </CardContent>
      </Card>

      <!-- 帝国研究 -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <FlaskConical class="h-4 w-4" />{{ t('autopilot.research') }}
          </CardTitle>
          <CardDescription>{{ t('autopilot.researchDesc') }}</CardDescription>
        </CardHeader>
        <CardContent v-if="researchConfig" class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <Switch :checked="researchConfig.enabled" @update:checked="onToggleResearch" />
            <span class="text-sm font-medium">{{ t('autopilot.enabled') }}</span>
            <Badge v-if="!researchConfig.enabled || researchConfig.paused" variant="outline">{{ t('autopilot.paused') }}</Badge>
            <Badge v-else-if="researchConfig.mode === 'execute' && researchConfig.downgradeReason" variant="destructive">{{ t('autopilot.downgraded') }}</Badge>
            <Badge v-else-if="researchConfig.mode === 'auto'" variant="default">{{ t('autopilot.modeAuto') }}</Badge>
            <Badge v-else variant="secondary">{{ t('autopilot.modeExecute') }}</Badge>
            <Button v-if="researchConfig.canResumeAuto" size="sm" @click="onResumeResearchAuto">
              <Play class="mr-2 h-4 w-4" />{{ t('autopilot.resumeAuto') }}
            </Button>
            <Button v-if="researchConfig.enabled && !researchConfig.paused" size="sm" variant="outline" @click="researchConfig.paused = true">
              <Pause class="mr-2 h-4 w-4" />{{ t('autopilot.pause') }}
            </Button>
            <Button v-if="researchConfig.enabled && researchConfig.paused" size="sm" variant="outline" @click="researchConfig.paused = false">
              <Play class="mr-2 h-4 w-4" />{{ t('autopilot.resume') }}
            </Button>
          </div>

          <div class="flex flex-wrap items-end gap-2">
            <div class="space-y-1">
              <Label>{{ t('autopilot.addTarget') }}</Label>
              <Select v-model="newResearchTech">
                <SelectTrigger class="w-[200px]">
                  <SelectValue :placeholder="t('autopilot.addTarget')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="tt in availableTechnologies" :key="tt" :value="tt">
                    {{ t(`technologies.${tt}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1">
              <Label>{{ t('autopilot.targetLevel') }}</Label>
              <Input v-model.number="newResearchLevel" type="number" min="1" max="30" class="w-[100px]" />
            </div>
            <Button size="sm" :disabled="!newResearchTech" @click="addResearchTarget">
              <Plus class="mr-2 h-4 w-4" />{{ t('autopilot.addTarget') }}
            </Button>
          </div>

          <div v-if="sortedResearchTargets.length === 0" class="text-sm text-muted-foreground">
            {{ t('autopilot.noTargets') }}
          </div>
          <div
            v-for="(target, i) in sortedResearchTargets"
            :key="target.id"
            class="flex items-center gap-2 p-2 border rounded-lg"
          >
            <span class="text-xs text-muted-foreground w-6 text-center">{{ i + 1 }}</span>
            <span class="font-medium flex-1 min-w-0 truncate">{{ t(`technologies.${target.technology}`) }}</span>
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ t('autopilot.currentLevel') }} {{ gameStore.player.technologies[target.technology] || 0 }}
            </span>
            <!-- BLK-4：草稿+失焦提交+夹值 -->
            <Input
              :model-value="target.targetLevel"
              type="number"
              :min="(gameStore.player.technologies[target.technology] || 0) + 1"
              max="30"
              class="w-[80px]"
              :aria-label="t('autopilot.targetLevel')"
              @change="(e: Event) => commitResearchTargetLevel(target, (e.target as HTMLInputElement).value)"
            />
            <div class="flex gap-1">
              <Button size="icon" variant="ghost" :disabled="i === 0" @click="moveResearchTarget(i, -1)">
                <ChevronUp class="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" :disabled="i === sortedResearchTargets.length - 1" @click="moveResearchTarget(i, 1)">
                <ChevronDown class="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" @click="removeResearchTarget(target.id)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div class="text-sm space-y-1">
            <p><span class="text-muted-foreground">{{ t('autopilot.lastDecision') }}: </span>{{ t(researchConfig.lastDecision ?? 'autopilot.decisionIdle') }}</p>
            <p v-if="researchConfig.downgradeReason" class="text-destructive">
              {{ t('autopilot.downgradeReason') }}: {{ t(researchConfig.downgradeReason) }}
            </p>
            <div v-if="researchBlockers.length > 0">
              <p class="text-muted-foreground">{{ t('autopilot.blockers') }}:</p>
              <ul class="list-disc list-inside text-destructive/90">
                <li v-for="(b, i) in researchBlockers" :key="i">{{ t(b.reason) }}（{{ researchBlockerLabel(b) }}）</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, onMounted, ref, watch } from 'vue'
  import type { Ref } from 'vue'
  import { useGameStore } from '@/stores/gameStore'
  import { useI18n } from '@/composables/useI18n'
  import { toast } from 'vue-sonner'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Button } from '@/components/ui/button'
  import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
  import ScrollableDialogContent from '@/components/ui/dialog/ScrollableDialogContent.vue'
  import { Badge } from '@/components/ui/badge'
  import { Switch } from '@/components/ui/switch'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import {
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    FlaskConical,
    GripVertical,
    Info,
    Pause,
    Play,
    Plus,
    Trash2
  } from 'lucide-vue-next'
  import { BuildingType, TechnologyType } from '@/types/game'
  import type { AutopilotMode, AutopilotPlanetConfig, AutopilotResearchTarget, AutopilotTarget, EmpireResearchAutopilot } from '@/types/game'
  import { BUILDINGS } from '@/config/gameConfig'
  import * as autopilotLogic from '@/logic/autopilotLogic'

  const { t } = useI18n()
  const gameStore = useGameStore()
  const planet = computed(() => gameStore.currentPlanet)

  /** 确保当前星球有副官配置（默认关闭）；只在用户操作/进入视图时调用，不在 computed 里写 store */
  function ensureConfig(): AutopilotPlanetConfig | null {
    const p = planet.value
    if (!p) return null
    if (!p.autopilot) p.autopilot = autopilotLogic.createDefaultPlanetAutopilot()
    return p.autopilot
  }
  const config = computed<AutopilotPlanetConfig | null>(() => planet.value?.autopilot ?? null)

  /** 帝国研究配置（默认关闭） */
  function ensureResearchConfig(): EmpireResearchAutopilot | null {
    const player = gameStore.player
    if (!player) return null
    if (!player.empireResearchAutopilot) {
      player.empireResearchAutopilot = autopilotLogic.createDefaultEmpireResearchAutopilot()
    }
    return player.empireResearchAutopilot
  }
  const researchConfig = computed<EmpireResearchAutopilot | null>(
    () => gameStore.player?.empireResearchAutopilot ?? null
  )

  onMounted(() => {
    ensureConfig()
    ensureResearchConfig()
  })
  watch(planet, () => ensureConfig())

  // ---------- 状态操作 ----------
  const toggleEnabled = (v: boolean) => {
    const c = ensureConfig()
    if (!c) return
    c.enabled = v
    if (v) c.paused = false
  }
  const onTakeOver = () => {
    const c = config.value
    const p = planet.value
    if (!c || !p) return
    c.enabled = false // 玩家接管：副官停止规划
    autopilotLogic.withdrawAutopilotWaiting(p) // MAJ-6：撤回副官等待项（已开工的不动）
  }
  const onSwitchMode = (mode: AutopilotMode) => {
    const c = config.value
    if (c) autopilotLogic.setAutopilotMode(c, mode)
  }
  const onResumeAuto = () => {
    const c = config.value
    if (c) autopilotLogic.resumeAutoMode(c)
  }
  const onResumeResearchAuto = () => {
    const c = researchConfig.value
    if (c) autopilotLogic.resumeAutoMode(c)
  }
  const onToggleResearch = (v: boolean) => {
    const c = ensureResearchConfig()
    if (!c) return
    c.enabled = v
    if (v) {
      c.paused = false
    } else {
      // MAJ-6：关闭研究副官时撤回其等待项（已开工的不动）
      autopilotLogic.withdrawAutopilotResearchWaiting(gameStore.player)
    }
  }

  // 上次 tick 的阻塞原因（App.vue 的副官 tick 把结果注入到这里）
  const tickResults = inject<Ref<Map<string, autopilotLogic.AutopilotTickResult | autopilotLogic.EmpireResearchTickResult>>>(
    'autopilotTickResults',
    ref(new Map<string, autopilotLogic.AutopilotTickResult | autopilotLogic.EmpireResearchTickResult>())
  )
  const lastBlockers = computed(() => {
    const p = planet.value
    if (!p) return []
    return tickResults.value.get(p.id)?.blockers ?? []
  })
  const blockerLabel = (b: { kind: string; itemType: string; level: number }) =>
    `${b.kind === 'technology' ? t(`technologies.${b.itemType}`) : t(`buildings.${b.itemType}`)} ${b.level}`
  const researchBlockerLabel = (b: { kind: string; itemType: string; level: number }) =>
    `${b.kind === 'building' ? t(`buildings.${b.itemType}`) : t(`technologies.${b.itemType}`)} ${b.level}`
  const researchBlockers = computed(() => tickResults.value.get('__empire__')?.blockers ?? [])

  // ---------- 目标清单 ----------
  const sortedTargets = computed(() =>
    [...(config.value?.targets ?? [])].sort((a, b) => a.priority - b.priority)
  )
  const syncPriorities = () => {
    sortedTargets.value.forEach((target, i) => {
      target.priority = i
    })
  }
  const availableBuildings = computed(() => {
    const p = planet.value
    if (!p) return []
    const used = new Set((config.value?.targets ?? []).map(tg => tg.buildingType))
    return Object.values(BuildingType).filter(bt => {
      const bc = BUILDINGS[bt]
      if (!bc) return false
      if (p.isMoon && bc.planetOnly) return false
      if (!p.isMoon && bc.moonOnly) return false
      return !used.has(bt)
    })
  })
  const newTargetBuilding = ref<string>('')
  const newTargetLevel = ref<number>(1)
  const addTarget = () => {
    const c = ensureConfig()
    const p = planet.value
    if (!c || !p || !newTargetBuilding.value) return
    const buildingType = newTargetBuilding.value as BuildingType
    const current = p.buildings[buildingType] || 0
    const level = Math.max(current + 1, Math.floor(newTargetLevel.value) || current + 1)
    c.targets.push(
      autopilotLogic.createAutopilotTarget(
        buildingType,
        level,
        c.targets.length,
        Date.now()
      )
    )
    syncPriorities()
    newTargetBuilding.value = ''
  }
  const removeTarget = (id: string) => {
    const c = config.value
    const p = planet.value
    if (!c || !p) return
    autopilotLogic.withdrawAutopilotWaiting(p, id) // MAJ-6：精准撤回归属该目标的副官等待项
    c.targets = c.targets.filter(tg => tg.id !== id)
    syncPriorities()
  }
  const moveTarget = (index: number, dir: -1 | 1) => {
    const c = config.value
    if (!c) return
    const arr = sortedTargets.value
    const j = index + dir
    if (j < 0 || j >= arr.length) return
    const a = arr[index]!
    const b = arr[j]!
    const tmp = a.priority
    a.priority = b.priority
    b.priority = tmp
  }
  const dragIndex = ref<number | null>(null)
  const onDragStart = (i: number) => {
    dragIndex.value = i
  }
  /** BLK-4：目标等级输入用草稿+失焦提交+夹值，打字途中不写存档，避免被 B12 重推误删 */
  const commitTargetLevel = (target: AutopilotTarget, raw: unknown) => {
    const p = planet.value
    if (!p) return
    const cur = p.buildings[target.buildingType] || 0
    const n = Math.floor(Number(raw))
    target.targetLevel = Number.isFinite(n) ? Math.min(60, Math.max(cur + 1, n)) : target.targetLevel
  }
  const commitResearchTargetLevel = (target: AutopilotResearchTarget, raw: unknown) => {
    const cur = gameStore.player.technologies[target.technology] || 0
    const n = Math.floor(Number(raw))
    target.targetLevel = Number.isFinite(n) ? Math.min(30, Math.max(cur + 1, n)) : target.targetLevel
  }
  const onDrop = (i: number) => {
    const from = dragIndex.value
    dragIndex.value = null
    if (from === null || from === i) return
    const arr = sortedTargets.value
    const [moved] = arr.splice(from, 1)
    if (!moved) return
    arr.splice(i, 0, moved)
    arr.forEach((target, idx) => {
      target.priority = idx
    })
  }

  // ---------- 蓝图 ----------
  const blueprints = autopilotLogic.AUTOPILOT_BLUEPRINTS
  const blueprintPreviewOpen = ref(false)
  const previewBlueprintId = ref<string | null>(null)
  const previewBlueprint = computed(() =>
    previewBlueprintId.value ? autopilotLogic.getAutopilotBlueprint(previewBlueprintId.value) ?? null : null
  )
  interface ChainPreviewItem {
    target: autopilotLogic.AutopilotBlueprintTarget
    chain: autopilotLogic.PrereqChainStep[]
    incompatible: boolean
  }
  /** Minor-8 / B4：套用前展示整条待补前置链；月球上 planetOnly 的目标标记为不兼容 */
  const blueprintChainPreview = computed<ChainPreviewItem[]>(() => {
    const p = planet.value
    const bp = previewBlueprint.value
    if (!p || !bp) return []
    return bp.targets.map(target => {
      const incompatible = p.isMoon && (BUILDINGS[target.buildingType]?.planetOnly ?? false)
      const chain = incompatible
        ? []
        : autopilotLogic.expandPrerequisiteChain(p, gameStore.player.technologies, target.buildingType, target.targetLevel)
      return { target, chain, incompatible }
    })
  })
  const openBlueprintPreview = (id: string) => {
    previewBlueprintId.value = id
    blueprintPreviewOpen.value = true
  }
  const confirmApplyBlueprint = () => {
    const c = ensureConfig()
    const p = planet.value
    const id = previewBlueprintId.value
    blueprintPreviewOpen.value = false
    if (!c || !p || !id) return
    // Minor-8：月球上过滤 planetOnly 建筑
    const ok = autopilotLogic.applyBlueprintToPlanet(
      c, id, Date.now(),
      t => !(p.isMoon && (BUILDINGS[t.buildingType]?.planetOnly ?? false))
    )
    if (ok) toast.success(t('autopilot.blueprintApplied'))
  }

  // ---------- 帝国研究 ----------
  const sortedResearchTargets = computed(() =>
    [...(researchConfig.value?.targets ?? [])].sort((a, b) => a.priority - b.priority)
  )
  const availableTechnologies = computed(() => {
    const used = new Set((researchConfig.value?.targets ?? []).map(tg => tg.technology))
    return Object.values(TechnologyType).filter(tt => !used.has(tt))
  })
  const newResearchTech = ref<string>('')
  const newResearchLevel = ref<number>(1)
  const addResearchTarget = () => {
    const c = researchConfig.value
    if (!c || !newResearchTech.value) return
    const technology = newResearchTech.value as TechnologyType
    const current = gameStore.player.technologies[technology] || 0
    const level = Math.max(current + 1, Math.floor(newResearchLevel.value) || current + 1)
    c.targets.push(
      autopilotLogic.createAutopilotResearchTarget(
        technology,
        level,
        c.targets.length,
        Date.now()
      )
    )
    sortedResearchTargets.value.forEach((target, i) => {
      target.priority = i
    })
    newResearchTech.value = ''
  }
  const removeResearchTarget = (id: string) => {
    const c = researchConfig.value
    if (!c) return
    autopilotLogic.withdrawAutopilotResearchWaiting(gameStore.player, id)
    c.targets = c.targets.filter(tg => tg.id !== id)
    sortedResearchTargets.value.forEach((target, i) => {
      target.priority = i
    })
  }
  const moveResearchTarget = (index: number, dir: -1 | 1) => {
    const arr = sortedResearchTargets.value
    const j = index + dir
    if (j < 0 || j >= arr.length) return
    const a = arr[index]!
    const b = arr[j]!
    const tmp = a.priority
    a.priority = b.priority
    b.priority = tmp
  }
</script>
