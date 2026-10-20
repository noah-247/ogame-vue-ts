<template>
  <div v-if="planet" class="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- 未解鎖遮罩 -->
    <UnlockRequirement :required-building="BuildingType.Shipyard" :required-level="1" />

    <h1 class="text-2xl sm:text-3xl font-bold">{{ t('fleetView.title') }}</h1>

    <!-- 標籤切換 -->
    <Tabs v-model="activeTab" class="w-full">
      <TabsList :class="['grid', 'w-full', showJumpGateTab ? 'grid-cols-3' : 'grid-cols-2']">
        <TabsTrigger v-for="tab in visibleTabs" :key="tab.value" :value="tab.value">
          {{ t(`fleetView.${tab.labelKey}`) }}
          <Badge v-if="tab.value === 'missions' && totalMissionsCount > 0" variant="destructive" class="ml-1">
            {{ totalMissionsCount }}
          </Badge>
          <Badge v-if="tab.value === 'jumpGate' && jumpGateReady" variant="default" class="ml-1">✓</Badge>
        </TabsTrigger>
      </TabsList>

      <!-- 派遣艦隊 -->
      <TabsContent value="send" class="mt-4 space-y-4">
        <!-- 艦隊任務槽位資訊 -->
        <Card>
          <CardContent class="py-4">
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium">{{ t('fleetView.fleetMissionSlots') }}:</span>
              <span class="text-sm font-bold">{{ gameStore.player.fleetMissions.length }} / {{ maxFleetMissions }}</span>
            </div>
          </CardContent>
        </Card>

        <!-- 艦隊預設 -->
        <Card>
          <CardHeader>
            <div class="flex justify-between items-center">
              <div>
                <CardTitle>{{ t('fleetView.fleetPresets') }}</CardTitle>
                <CardDescription>{{ t('fleetView.fleetPresetsDescription') }}</CardDescription>
              </div>
              <Button @click="saveAsPreset" variant="outline" size="sm" :disabled="fleetPresets.length >= MAX_PRESETS">
                <Save class="h-4 w-4 mr-1" />
                {{ t('fleetView.savePreset') }}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="fleetPresets.length === 0" class="text-center py-4 text-muted-foreground text-sm">
              {{ t('fleetView.noPresets') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="preset in fleetPresets"
                :key="preset.id"
                class="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                :class="{ 'ring-2 ring-primary': editingPresetId === preset.id }"
              >
                <div class="flex-1 cursor-pointer" @click="loadPreset(preset)">
                  <div class="flex items-center gap-2">
                    <Star class="h-4 w-4 text-yellow-500" />
                    <span class="font-medium">{{ preset.name }}</span>
                  </div>
                  <div class="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                    <span v-if="preset.missionType">
                      {{ getMissionName(preset.missionType) }}
                    </span>
                    <span>{{ Object.entries(preset.fleet).filter(([_, count]) => count > 0).length }} {{ t('fleetView.shipTypes') }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <Button v-if="editingPresetId === preset.id" @click="updatePreset(preset.id)" variant="default" size="sm">
                    {{ t('common.save') }}
                  </Button>
                  <Button
                    v-if="editingPresetId !== preset.id"
                    @click="editingPresetId = preset.id"
                    variant="ghost"
                    size="sm"
                    :title="t('fleetView.editPreset')"
                  >
                    <Pencil class="h-4 w-4" />
                  </Button>
                  <Button @click.stop="startRenamePreset(preset)" variant="ghost" size="sm" :title="t('fleetView.renamePreset')">
                    <Type class="h-4 w-4" />
                  </Button>
                  <Button
                    @click.stop="deletePreset(preset.id)"
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    :title="t('fleetView.deletePreset')"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <p v-if="editingPresetId" class="text-xs text-muted-foreground mt-2">
              {{ t('fleetView.editingPresetHint') }}
            </p>
          </CardContent>
        </Card>

        <!-- 選擇艦隊 -->
        <Card>
          <CardHeader>
            <CardTitle>{{ t('fleetView.selectFleet') }}</CardTitle>
            <CardDescription>{{ t('fleetView.selectFleetDescription') }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div v-for="(count, shipType) in planet.fleet" :key="shipType" class="space-y-2">
                <Label :for="`ship-${shipType}`" class="text-xs sm:text-sm">
                  {{ SHIPS[shipType].name }} ({{ t('fleetView.available') }}: {{ count }})
                </Label>
                <div class="flex gap-2">
                  <Input
                    :id="`ship-${shipType}`"
                    v-model.number="selectedFleet[shipType]"
                    type="number"
                    min="0"
                    :max="count"
                    placeholder="0"
                    class="text-sm"
                  />
                  <Button @click="selectedFleet[shipType] = count" variant="outline" size="sm">{{ t('fleetView.all') }}</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 目標座標 -->
        <Card>
          <CardHeader>
            <CardTitle>{{ t('fleetView.targetCoordinates') }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-3 gap-2 sm:gap-4">
              <div v-for="coord in coordinateFields" :key="coord.key" class="space-y-2">
                <Label :for="coord.key" class="text-xs sm:text-sm">{{ t(`fleetView.${coord.key}`) }}</Label>
                <Input :id="coord.key" v-model.number="targetPosition[coord.key]" type="number" :min="1" :max="coord.max" placeholder="1" />
              </div>
            </div>
            <!-- 目標型別選擇（行星/月球） -->
            <div v-if="hasMoonAtTargetPosition" class="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <span class="text-sm font-medium">{{ t('fleetView.targetType') }}:</span>
              <div class="flex gap-2">
                <Button @click="targetIsMoon = false" :variant="!targetIsMoon ? 'default' : 'outline'" size="sm">
                  <Globe class="h-4 w-4 mr-1" />
                  {{ t('fleetView.planet') }}
                </Button>
                <Button @click="targetIsMoon = true" :variant="targetIsMoon ? 'default' : 'outline'" size="sm">
                  <Moon class="h-4 w-4 mr-1" />
                  {{ t('fleetView.moon') }}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 任務型別 -->
        <Card>
          <CardHeader>
            <CardTitle>{{ t('fleetView.missionType') }}</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button
                v-for="mission in availableMissions"
                :key="mission.type"
                @click="selectedMission = mission.type"
                :variant="selectedMission === mission.type ? 'default' : 'outline'"
                class="justify-start"
              >
                <component :is="mission.icon" class="h-4 w-4 mr-2" />
                {{ mission.name }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- 探險區域選擇（僅探險任務） -->
        <Card v-if="selectedMission === MissionType.Expedition">
          <CardHeader>
            <CardTitle>{{ t('fleetView.expeditionZone') }}</CardTitle>
            <CardDescription>{{ t('fleetView.expeditionZoneDesc') }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                v-for="item in availableExpeditionZones"
                :key="item.zone"
                @click="item.unlocked && (selectedExpeditionZone = item.zone)"
                variant="outline"
                :disabled="!item.unlocked"
                :class="[
                  'h-auto py-3 flex flex-col items-start text-left',
                  selectedExpeditionZone === item.zone ? 'ring-2 ring-primary' : ''
                ]"
              >
                <div class="flex items-center gap-2 w-full">
                  <span class="font-medium">{{ t(`fleetView.zones.${item.zone}.name`) }}</span>
                  <Badge v-if="!item.unlocked" variant="secondary" class="ml-auto text-xs">
                    {{ t('fleetView.requiresAstro', { level: item.config.requiredTechLevel }) }}
                  </Badge>
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  {{ t(`fleetView.zones.${item.zone}.desc`) }}
                </div>
                <div class="flex gap-3 mt-2 text-xs">
                  <span :class="item.config.resourceMultiplier > 1 ? 'text-green-500' : ''">
                    {{ t('fleetView.reward') }}: x{{ item.config.resourceMultiplier }}
                  </span>
                  <span :class="item.config.dangerMultiplier > 1 ? 'text-red-500' : 'text-green-500'">
                    {{ t('fleetView.danger') }}: x{{ item.config.dangerMultiplier }}
                  </span>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- 運輸資源（僅運輸任務） -->
        <Card v-if="selectedMission === MissionType.Transport">
          <CardHeader>
            <CardTitle>{{ t('fleetView.transportResources') }}</CardTitle>
          </CardHeader>
          <CardContent>
            <!-- 贈送模式切換（僅當目標是NPC星球時顯示） -->
            <div v-if="targetNpc" class="mb-4 p-3 border rounded-lg bg-muted/50">
              <div class="flex items-center gap-2 mb-2">
                <Checkbox id="gift-mode" v-model:checked="isGiftMode" />
                <Label for="gift-mode" class="flex items-center gap-2 cursor-pointer">
                  <Gift class="h-4 w-4" />
                  {{ t('fleetView.giftMode') }}
                </Label>
              </div>
              <p class="text-xs text-muted-foreground">{{ t('fleetView.giftModeDescription') }} {{ targetNpc.name }}</p>
              <div v-if="isGiftMode && (cargo.metal > 0 || cargo.crystal > 0 || cargo.deuterium > 0)" class="mt-2 text-xs">
                <span class="text-muted-foreground">{{ t('fleetView.estimatedReputationGain') }}:</span>
                <span class="ml-1 font-semibold text-green-600 dark:text-green-400">+{{ calculateGiftReputation() }}</span>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div v-for="res in cargoResourceFields" :key="res.key" class="space-y-2">
                <Label :for="`cargo-${res.key}`" class="text-xs sm:text-sm flex items-center gap-2">
                  <ResourceIcon :type="res.key" size="sm" />
                  {{ t(`resources.${res.key}`) }} ({{ t('fleetView.available') }}: {{ formatNumber(planet.resources[res.key]) }})
                </Label>
                <Input
                  :id="`cargo-${res.key}`"
                  v-model.number="cargo[res.key]"
                  type="number"
                  min="0"
                  :max="planet.resources[res.key]"
                  placeholder="0"
                />
              </div>
            </div>
            <p class="text-xs sm:text-sm text-muted-foreground mt-2">
              {{ t('fleetView.totalCargoCapacity') }}: {{ formatNumber(getTotalCargoCapacity()) }} | {{ t('fleetView.used') }}:
              {{ formatNumber(getTotalCargo()) }}
            </p>
          </CardContent>
        </Card>

        <!-- 任務資訊 -->
        <Card>
          <CardHeader>
            <CardTitle>{{ t('fleetView.missionInfo') }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-muted-foreground">{{ t('fleetView.fuelConsumption') }}:</span>
              <span class="flex items-center gap-1.5">
                <ResourceIcon type="deuterium" size="sm" />
                <span :class="getFuelConsumption() > planet.resources.deuterium ? 'text-red-600 dark:text-red-400 font-medium' : ''">
                  {{ formatNumber(getFuelConsumption()) }}
                </span>
                <span class="text-muted-foreground">/ {{ formatNumber(planet.resources.deuterium) }}</span>
              </span>
            </div>
            <div v-if="Object.values(selectedFleet).some(c => c > 0)" class="flex justify-between text-xs sm:text-sm">
              <span class="text-muted-foreground">{{ t('fleetView.flightTime') }}:</span>
              <span>{{ formatTime(getFlightTime()) }}</span>
            </div>
          </CardContent>
        </Card>

        <!-- 派遣按鈕 -->
        <Button @click="handleSendFleet" :disabled="!canSendFleet()" class="w-full" size="lg">{{ t('fleetView.sendFleet') }}</Button>
      </TabsContent>

      <!-- 飛行任務 -->
      <TabsContent value="missions" class="mt-4 space-y-4">
        <Empty v-if="totalMissionsCount === 0" class="border rounded-lg">
          <EmptyContent>
            <RocketIcon class="h-10 w-10 text-muted-foreground" />
            <EmptyDescription>{{ t('fleetView.noFlightMissions') }}</EmptyDescription>
          </EmptyContent>
        </Empty>

        <!-- 艦隊任務 -->
        <Card v-for="mission in gameStore.player.fleetMissions" :key="mission.id">
          <CardHeader>
            <div class="flex justify-between items-start">
              <div>
                <CardTitle class="text-base sm:text-lg flex items-center gap-2">
                  {{ getMissionName(mission.missionType) }}
                  <Badge v-if="mission.missionType === MissionType.Expedition && mission.expeditionZone" variant="outline" class="text-xs">
                    {{ t(`fleetView.zones.${mission.expeditionZone}.name`) }}
                  </Badge>
                </CardTitle>
                <CardDescription class="text-xs sm:text-sm">
                  {{ getPlanetName(mission.originPlanetId) }} → [{{ mission.targetPosition.galaxy }}:{{ mission.targetPosition.system }}:{{
                    mission.targetPosition.position
                  }}]
                </CardDescription>
              </div>
              <Badge :variant="mission.status === 'outbound' ? 'default' : 'secondary'">
                {{ mission.status === 'outbound' ? t('fleetView.outbound') : t('fleetView.returning') }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <!-- 艦隊組成 -->
            <div>
              <p class="text-xs sm:text-sm font-medium mb-2">{{ t('fleetView.fleetComposition') }}:</p>
              <div class="flex flex-wrap gap-2">
                <Badge v-for="(count, shipType) in mission.fleet" :key="shipType" variant="outline">
                  {{ SHIPS[shipType].name }}: {{ count }}
                </Badge>
              </div>
            </div>

            <!-- 攜帶資源 -->
            <div v-if="hasCargoResources(mission.cargo)">
              <p class="text-xs sm:text-sm font-medium mb-2">{{ t('fleetView.carryingResources') }}:</p>
              <div class="flex flex-wrap gap-2 text-xs">
                <template v-for="res in cargoResourceFields" :key="res.key">
                  <span v-if="mission.cargo[res.key] > 0" class="flex items-center gap-1">
                    <ResourceIcon :type="res.key" size="sm" />
                    {{ formatNumber(mission.cargo[res.key]) }}
                  </span>
                </template>
              </div>
            </div>

            <!-- 進度條 -->
            <div class="space-y-2">
              <div class="flex justify-between text-xs sm:text-sm">
                <span>{{ mission.status === 'outbound' ? t('fleetView.arrivalTime') : t('fleetView.returnTime') }}:</span>
                <span>{{ formatTime(getRemainingTime(mission)) }}</span>
              </div>
              <Progress :model-value="getMissionProgress(mission)" />
            </div>

            <!-- 操作 -->
            <div class="flex gap-2">
              <Button
                v-if="mission.status === 'outbound'"
                @click="handleRecallFleet(mission.id)"
                variant="outline"
                size="sm"
                class="w-full"
              >
                {{ t('fleetView.recallFleet') }}
              </Button>
              <Button
                v-if="mission.status === 'returning' || mission.status === 'arrived'"
                @click="handleAbortMission(mission.id)"
                variant="destructive"
                size="sm"
                class="w-full"
              >
                {{ t('fleetView.abortMission') }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- 導彈攻擊任務 -->
        <Card v-for="missileAttack in flyingMissileAttacks" :key="missileAttack.id">
          <CardHeader>
            <div class="flex justify-between items-start">
              <div>
                <CardTitle class="text-base sm:text-lg flex items-center gap-2">
                  <Crosshair class="h-4 w-4 text-destructive" />
                  {{ t('galaxyView.missileAttackTitle') }}
                </CardTitle>
                <CardDescription class="text-xs sm:text-sm">
                  {{ getPlanetName(missileAttack.originPlanetId) }} → [{{ missileAttack.targetPosition.galaxy }}:{{ missileAttack.targetPosition.system }}:{{
                    missileAttack.targetPosition.position
                  }}]
                </CardDescription>
              </div>
              <Badge variant="destructive">
                {{ t('fleetView.outbound') }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <!-- 導彈數量 -->
            <div>
              <p class="text-xs sm:text-sm font-medium mb-2">{{ t('galaxyView.missileCount') }}:</p>
              <Badge variant="outline">{{ missileAttack.missileCount }}</Badge>
            </div>

            <!-- 進度條 -->
            <div class="space-y-2">
              <div class="flex justify-between text-xs sm:text-sm">
                <span>{{ t('fleetView.arrivalTime') }}:</span>
                <span>{{ formatTime(getMissileRemainingTime(missileAttack)) }}</span>
              </div>
              <Progress :model-value="getMissileProgress(missileAttack)" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- 跳躍門 -->
      <TabsContent v-if="showJumpGateTab" value="jumpGate" class="mt-4 space-y-4">
        <!-- 跳躍門狀態 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Zap class="h-5 w-5" />
              {{ t('fleetView.jumpGate') }}
            </CardTitle>
            <CardDescription>{{ t('fleetView.jumpGateDescription') }}</CardDescription>
          </CardHeader>
          <CardContent>
            <!-- 冷卻狀態 -->
            <div v-if="!jumpGateReady" class="p-4 bg-muted/50 rounded-lg">
              <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Clock class="h-4 w-4" />
                <span class="font-medium">{{ t('fleetView.jumpGateCooldown') }}</span>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <span class="text-sm text-muted-foreground">{{ t('fleetView.jumpGateCooldownRemaining') }}:</span>
                <span class="font-bold">{{ formatTime(Math.floor(jumpGateCooldownRemaining / 1000)) }}</span>
              </div>
              <Progress :model-value="100 - (jumpGateCooldownRemaining / 3600000) * 100" class="mt-2" />
            </div>
            <!-- 就緒狀態 -->
            <div v-else class="p-4 bg-green-500/10 rounded-lg">
              <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check class="h-4 w-4" />
                <span class="font-medium">{{ t('fleetView.jumpGateReady') }}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 選擇目標月球 -->
        <Card v-if="jumpGateReady">
          <CardHeader>
            <CardTitle>{{ t('fleetView.jumpGateSelectTarget') }}</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="availableJumpGateMoons.length === 0" class="text-center py-4 text-muted-foreground">
              {{ t('fleetView.jumpGateNoTargetMoons') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="moon in availableJumpGateMoons"
                :key="moon.id"
                class="p-3 border rounded-lg cursor-pointer transition-colors"
                :class="selectedJumpGateTarget?.id === moon.id ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted/50'"
                @click="selectedJumpGateTarget = moon"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <span class="font-medium">{{ moon.name }}</span>
                    <span class="text-sm text-muted-foreground ml-2">
                      [{{ moon.position.galaxy }}:{{ moon.position.system }}:{{ moon.position.position }}]
                    </span>
                  </div>
                  <Badge v-if="isJumpGateMoonReady(moon)" variant="default">{{ t('fleetView.jumpGateReady') }}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 選擇傳送艦隊 -->
        <Card v-if="jumpGateReady && selectedJumpGateTarget">
          <CardHeader>
            <CardTitle>{{ t('fleetView.jumpGateSelectFleet') }}</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div v-for="(count, shipType) in planet.fleet" :key="shipType" class="space-y-2">
                <Label :for="`jump-ship-${shipType}`" class="text-xs sm:text-sm">
                  {{ SHIPS[shipType].name }} ({{ t('fleetView.available') }}: {{ count }})
                </Label>
                <div class="flex gap-2">
                  <Input
                    :id="`jump-ship-${shipType}`"
                    v-model.number="jumpGateFleet[shipType]"
                    type="number"
                    min="0"
                    :max="count"
                    placeholder="0"
                    class="text-sm"
                  />
                  <Button @click="jumpGateFleet[shipType] = count" variant="outline" size="sm">{{ t('fleetView.all') }}</Button>
                </div>
              </div>
            </div>

            <!-- 傳送按鈕 -->
            <div class="mt-6">
              <Button @click="executeJumpGateTransfer" :disabled="!canExecuteJumpGate" class="w-full">
                <Zap class="h-4 w-4 mr-2" />
                {{ t('fleetView.jumpGateTransfer') }}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- 提示對話方塊 -->
    <AlertDialog :open="alertDialogOpen" @update:open="alertDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ alertDialogTitle }}</AlertDialogTitle>
          <AlertDialogDescription class="whitespace-pre-line">
            {{ alertDialogMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel v-if="alertDialogCallback">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="handleAlertConfirm">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 預設名稱對話方塊 -->
    <AlertDialog :open="showPresetNameDialog" @update:open="showPresetNameDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ pendingPresetAction === 'save' ? t('fleetView.savePresetTitle') : t('fleetView.renamePresetTitle') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ pendingPresetAction === 'save' ? t('fleetView.savePresetDescription') : t('fleetView.renamePresetDescription') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div class="py-4">
          <Label for="preset-name">{{ t('fleetView.presetName') }}</Label>
          <Input
            id="preset-name"
            v-model="editingPresetName"
            :placeholder="t('fleetView.presetNamePlaceholder')"
            class="mt-2"
            @keyup.enter="handlePresetNameConfirm"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            @click="
              () => {
                showPresetNameDialog = false
                pendingPresetAction = null
              }
            "
          >
            {{ t('common.cancel') }}
          </AlertDialogCancel>
          <AlertDialogAction @click="handlePresetNameConfirm" :disabled="!editingPresetName.trim()">
            {{ t('common.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
  import { getGameNow } from '@/logic/gameTime'
  import { useGameStore } from '@/stores/gameStore'
  import { useUniverseStore } from '@/stores/universeStore'
  import { useNPCStore } from '@/stores/npcStore'
  import { useI18n } from '@/composables/useI18n'
  import { useGameConfig } from '@/composables/useGameConfig'
  import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ShipType, MissionType, BuildingType, TechnologyType, ExpeditionZone } from '@/types/game'
  import type { Fleet, Resources, FleetPreset } from '@/types/game'
  import { EXPEDITION_ZONES } from '@/config/gameConfig'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Badge } from '@/components/ui/badge'
  import { Progress } from '@/components/ui/progress'
  import { Checkbox } from '@/components/ui/checkbox'
  import ResourceIcon from '@/components/common/ResourceIcon.vue'
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
  import UnlockRequirement from '@/components/common/UnlockRequirement.vue'
  import { Empty, EmptyContent, EmptyDescription } from '@/components/ui/empty'
  import {
    Sword,
    Package,
    Rocket as RocketIcon,
    Eye,
    Users,
    Recycle,
    Skull,
    Gift,
    Compass,
    Save,
    Trash2,
    Pencil,
    Star,
    Type,
    Zap,
    Clock,
    Check,
    Globe,
    Moon,
    Crosshair
  } from 'lucide-vue-next'
  import { formatNumber, formatTime } from '@/utils/format'
  import * as shipValidation from '@/logic/shipValidation'
  import * as fleetLogic from '@/logic/fleetLogic'
  import * as shipLogic from '@/logic/shipLogic'
  import * as officerLogic from '@/logic/officerLogic'
  import * as publicLogic from '@/logic/publicLogic'
  import * as diplomaticLogic from '@/logic/diplomaticLogic'
  import * as gameLogic from '@/logic/gameLogic'
  import * as moonLogic from '@/logic/moonLogic'
  import { generateId } from '@/utils/id'

  const route = useRoute()
  const gameStore = useGameStore()
  const universeStore = useUniverseStore()
  const npcStore = useNPCStore()
  const { t } = useI18n()
  const { SHIPS } = useGameConfig()
  const planet = computed(() => gameStore.currentPlanet)

  // 建立預設空艦隊對映
  const createEmptyFleet = (): Partial<Fleet> => {
    const fleet: Partial<Fleet> = {}
    for (const type of Object.values(ShipType)) {
      fleet[type] = 0
    }
    return fleet
  }

  // AlertDialog 狀態
  const alertDialogOpen = ref(false)
  const alertDialogTitle = ref('')
  const alertDialogMessage = ref('')
  const alertDialogCallback = ref<(() => void) | null>(null)

  // 當前時間（響應式）
  const currentTime = ref(getGameNow())
  let timeInterval: number | null = null

  // 計算最大艦隊任務槽位
  const maxFleetMissions = computed(() => {
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    const computerTechLevel = gameStore.player.technologies[TechnologyType.ComputerTechnology] || 0
    return publicLogic.getMaxFleetMissions(bonuses.additionalFleetSlots, computerTechLevel)
  })

  // 飛行中的導彈攻擊
  const flyingMissileAttacks = computed(() => {
    return gameStore.player.missileAttacks?.filter(m => m.status === 'flying') || []
  })

  // 總任務數量（艦隊任務 + 導彈攻擊）
  const totalMissionsCount = computed(() => {
    return gameStore.player.fleetMissions.length + flyingMissileAttacks.value.length
  })

  const activeTab = ref<'send' | 'missions' | 'jumpGate'>('send')

  // Tab 配置
  const fleetTabs = [
    { value: 'send', labelKey: 'sendFleet' },
    { value: 'missions', labelKey: 'flightMissions' },
    { value: 'jumpGate', labelKey: 'jumpGate' }
  ] as const

  // 跳躍門相關
  const selectedJumpGateTarget = ref<typeof planet.value | null>(null)
  const jumpGateFleet = ref<Partial<Fleet>>(createEmptyFleet())

  // 是否顯示跳躍門標籤頁（當前在月球上且有跳躍門）
  const showJumpGateTab = computed(() => {
    if (!planet.value) return false
    if (!planet.value.isMoon) return false
    const jumpGateLevel = planet.value.buildings[BuildingType.JumpGate] || 0
    return jumpGateLevel > 0
  })

  // 跳躍門是否就緒（冷卻完成）
  const jumpGateReady = computed(() => {
    if (!planet.value) return false
    return moonLogic.isJumpGateReady(planet.value)
  })

  // 跳躍門剩餘冷卻時間
  const jumpGateCooldownRemaining = computed(() => {
    if (!planet.value) return 0
    return moonLogic.getJumpGateCooldownRemaining(planet.value)
  })

  // 可用的目標月球（有跳躍門且冷卻完成的其他月球）
  const availableJumpGateMoons = computed(() => {
    if (!planet.value) return []
    return gameStore.player.planets.filter(p => {
      if (p.id === planet.value?.id) return false // 排除當前月球
      if (!p.isMoon) return false
      const jumpGateLevel = p.buildings[BuildingType.JumpGate] || 0
      if (jumpGateLevel <= 0) return false
      return moonLogic.isJumpGateReady(p)
    })
  })

  // 檢查目標月球的跳躍門是否就緒
  const isJumpGateMoonReady = (moon: typeof planet.value) => {
    if (!moon) return false
    return moonLogic.isJumpGateReady(moon)
  }

  // 是否可以執行跳躍門傳送
  const canExecuteJumpGate = computed(() => {
    if (!planet.value || !selectedJumpGateTarget.value) return false
    if (!jumpGateReady.value) return false
    // 檢查是否選擇了至少一艘艦船
    const totalShips = Object.values(jumpGateFleet.value).reduce((sum, count) => sum + (count || 0), 0)
    return totalShips > 0
  })

  // 執行跳躍門傳送
  const executeJumpGateTransfer = () => {
    if (!planet.value || !selectedJumpGateTarget.value) return
    if (!canExecuteJumpGate.value) return

    const sourceMoon = planet.value
    const targetMoon = selectedJumpGateTarget.value

    // 轉移艦隊
    Object.entries(jumpGateFleet.value).forEach(([shipType, count]) => {
      if (count && count > 0) {
        const ship = shipType as ShipType
        // 從源月球扣除
        if (sourceMoon.fleet[ship] >= count) {
          sourceMoon.fleet[ship] -= count
          // 新增到目標月球
          targetMoon.fleet[ship] = (targetMoon.fleet[ship] || 0) + count
        }
      }
    })

    // 設定兩個跳躍門的冷卻時間
    moonLogic.useJumpGate(sourceMoon)
    moonLogic.useJumpGate(targetMoon)

    // 重置跳躍門艦隊選擇
    Object.keys(jumpGateFleet.value).forEach(key => {
      jumpGateFleet.value[key as ShipType] = 0
    })
    selectedJumpGateTarget.value = null

    // 顯示成功對話方塊
    alertDialogTitle.value = t('fleetView.jumpGateSuccess')
    alertDialogMessage.value = t('fleetView.jumpGateSuccessMessage', {
      target: `${targetMoon.name} [${targetMoon.position.galaxy}:${targetMoon.position.system}:${targetMoon.position.position}]`
    })
    alertDialogCallback.value = null
    alertDialogOpen.value = true
  }

  // 可見的標籤頁（根據是否有跳躍門動態顯示）
  const visibleTabs = computed(() => {
    if (showJumpGateTab.value) {
      return fleetTabs
    }
    return fleetTabs.filter(tab => tab.value !== 'jumpGate')
  })

  // 選擇的艦隊
  const selectedFleet = ref<Partial<Fleet>>(createEmptyFleet())

  // 目標座標
  const targetPosition = ref({ galaxy: 1, system: 1, position: 1 })

  // 目標是否為月球（用於區分同坐標的行星和月球）
  const targetIsMoon = ref(false)

  // 檢查目標位置是否有月球（玩家自己的）
  const hasMoonAtTargetPosition = computed(() => {
    return gameStore.player.planets.some(
      p =>
        p.isMoon &&
        p.position.galaxy === targetPosition.value.galaxy &&
        p.position.system === targetPosition.value.system &&
        p.position.position === targetPosition.value.position
    )
  })

  // 座標欄位配置
  const coordinateFields: { key: keyof typeof targetPosition.value; max: number }[] = [
    { key: 'galaxy', max: 9 },
    { key: 'system', max: 10 },
    { key: 'position', max: 10 }
  ]

  // 選擇的任務型別
  const selectedMission = ref<MissionType>(MissionType.Attack)

  // 探險區域選擇
  const selectedExpeditionZone = ref<ExpeditionZone>(ExpeditionZone.NearSpace)

  // 獲取玩家的天體物理學等級
  const astrophysicsLevel = computed(() => {
    return gameStore.player.technologies[TechnologyType.Astrophysics] || 0
  })

  // 可用的探險區域（基於天體物理學等級）
  const availableExpeditionZones = computed(() => {
    return Object.values(ExpeditionZone).map(zone => ({
      zone,
      config: EXPEDITION_ZONES[zone],
      unlocked: astrophysicsLevel.value >= EXPEDITION_ZONES[zone].requiredTechLevel
    }))
  })

  // 運輸資源
  const cargo = ref({ metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 })

  // 貨物資源欄位配置
  type CargoKey = 'metal' | 'crystal' | 'deuterium' | 'darkMatter'
  const cargoResourceFields: { key: CargoKey }[] = [{ key: 'metal' }, { key: 'crystal' }, { key: 'deuterium' }, { key: 'darkMatter' }]

  // 從 URL query 引數初始化
  onMounted(() => {
    // 啟動定時器更新當前時間
    timeInterval = window.setInterval(() => {
      currentTime.value = getGameNow()
    }, 1000) // 每秒更新一次

    const { galaxy, system, position, mission, gift } = route.query

    // 如果有引數，填充資料
    if (galaxy || system || position) {
      // 設定目標座標
      if (galaxy) targetPosition.value.galaxy = Number(galaxy)
      if (system) targetPosition.value.system = Number(system)
      if (position) targetPosition.value.position = Number(position)

      // 設定任務型別
      if (mission === 'spy') {
        selectedMission.value = MissionType.Spy
      } else if (mission === 'attack') {
        selectedMission.value = MissionType.Attack
      } else if (mission === 'colonize') {
        selectedMission.value = MissionType.Colonize
      } else if (mission === 'recycle') {
        selectedMission.value = MissionType.Recycle
      } else if (gift === '1') {
        // 如果有gift引數，設定為運輸任務並啟用贈送模式
        selectedMission.value = MissionType.Transport
        isGiftMode.value = true
      }

      // 自動切換到派遣艦隊標籤
      activeTab.value = 'send'
    }
  })

  // 清理定時器
  onUnmounted(() => {
    if (timeInterval) {
      clearInterval(timeInterval)
    }
  })

  // 檢查目標是否為NPC星球
  const targetNpc = computed(() => {
    return npcStore.npcs.find(npc =>
      npc.planets.some(
        p =>
          p.position.galaxy === targetPosition.value.galaxy &&
          p.position.system === targetPosition.value.system &&
          p.position.position === targetPosition.value.position
      )
    )
  })

  // 是否為贈送模式
  const isGiftMode = ref(false)

  // 艦隊預設相關狀態
  const MAX_PRESETS = 5
  const editingPresetId = ref<string | null>(null)
  const editingPresetName = ref('')
  const showPresetNameDialog = ref(false)
  const pendingPresetAction = ref<'save' | 'rename' | null>(null)

  // 獲取預設列表
  const fleetPresets = computed(() => gameStore.player.fleetPresets || [])

  // 生成唯一ID
  const generatePresetId = (): string => {
    return generateId('fleet_preset')
  }

  // 儲存當前配置為預設
  const saveAsPreset = () => {
    if (fleetPresets.value.length >= MAX_PRESETS) {
      alertDialogTitle.value = t('fleetView.presetLimitReached')
      alertDialogMessage.value = t('fleetView.presetLimitReachedMessage', { max: MAX_PRESETS.toString() })
      alertDialogCallback.value = null
      alertDialogOpen.value = true
      return
    }

    // 檢查是否有選擇艦船
    const hasShips = Object.values(selectedFleet.value).some(count => count > 0)
    if (!hasShips) {
      alertDialogTitle.value = t('fleetView.presetError')
      alertDialogMessage.value = t('fleetView.presetNoShips')
      alertDialogCallback.value = null
      alertDialogOpen.value = true
      return
    }

    pendingPresetAction.value = 'save'
    editingPresetName.value = t('fleetView.presetDefaultName', { number: (fleetPresets.value.length + 1).toString() })
    showPresetNameDialog.value = true
  }

  // 確認儲存預設
  const confirmSavePreset = () => {
    if (!editingPresetName.value.trim()) return

    // 只儲存數量大於0的艦船
    const fleetToSave: Partial<Fleet> = {}
    for (const [shipType, count] of Object.entries(selectedFleet.value)) {
      if (count && count > 0) {
        fleetToSave[shipType as ShipType] = count
      }
    }

    // 只儲存數量大於0的資源
    const cargoToSave: Partial<Resources> | undefined =
      selectedMission.value === MissionType.Transport
        ? {
            metal: cargo.value.metal || 0,
            crystal: cargo.value.crystal || 0,
            deuterium: cargo.value.deuterium || 0,
            darkMatter: cargo.value.darkMatter || 0
          }
        : undefined

    const newPreset: FleetPreset = {
      id: generatePresetId(),
      name: editingPresetName.value.trim(),
      fleet: fleetToSave,
      // 不再儲存座標，預設只儲存艦隊配置
      missionType: selectedMission.value,
      cargo: cargoToSave
    }

    if (!gameStore.player.fleetPresets) {
      gameStore.player.fleetPresets = []
    }
    gameStore.player.fleetPresets.push(newPreset)

    showPresetNameDialog.value = false
    editingPresetName.value = ''
    pendingPresetAction.value = null
  }

  // 載入預設
  const loadPreset = (preset: FleetPreset) => {
    // 載入艦隊配置
    Object.values(ShipType).forEach(key => {
      selectedFleet.value[key] = preset.fleet[key] || 0
    })

    // 不再載入座標，保留使用者當前輸入的座標

    // 載入任務型別
    if (preset.missionType) {
      selectedMission.value = preset.missionType
    }

    // 載入運輸資源
    if (preset.cargo && preset.missionType === MissionType.Transport) {
      cargo.value = {
        metal: preset.cargo.metal || 0,
        crystal: preset.cargo.crystal || 0,
        deuterium: preset.cargo.deuterium || 0,
        darkMatter: preset.cargo.darkMatter || 0,
        energy: 0
      }
    }
  }

  // 更新預設（點選預設後修改內容）
  const updatePreset = (presetId: string) => {
    const presetIndex = gameStore.player.fleetPresets?.findIndex(p => p.id === presetId)
    if (presetIndex === undefined || presetIndex === -1) return

    const hasShips = Object.values(selectedFleet.value).some(count => count > 0)
    if (!hasShips) {
      alertDialogTitle.value = t('fleetView.presetError')
      alertDialogMessage.value = t('fleetView.presetNoShips')
      alertDialogCallback.value = null
      alertDialogOpen.value = true
      return
    }

    const existingPreset = gameStore.player.fleetPresets![presetIndex]
    if (!existingPreset) return

    // 只儲存數量大於0的艦船
    const fleetToSave: Partial<Fleet> = {}
    for (const [shipType, count] of Object.entries(selectedFleet.value)) {
      if (count && count > 0) {
        fleetToSave[shipType as ShipType] = count
      }
    }

    // 只儲存數量大於0的資源
    const cargoToSave: Partial<Resources> | undefined =
      selectedMission.value === MissionType.Transport
        ? {
            metal: cargo.value.metal || 0,
            crystal: cargo.value.crystal || 0,
            deuterium: cargo.value.deuterium || 0,
            darkMatter: cargo.value.darkMatter || 0
          }
        : undefined

    const updatedPreset: FleetPreset = {
      id: existingPreset.id,
      name: existingPreset.name,
      fleet: fleetToSave,
      // 不再儲存座標
      missionType: selectedMission.value,
      cargo: cargoToSave
    }

    gameStore.player.fleetPresets![presetIndex] = updatedPreset
    editingPresetId.value = null
  }

  // 開始編輯預設名稱
  const startRenamePreset = (preset: FleetPreset) => {
    // 儲存要重新命名的預設ID，但不進入編輯內容模式
    editingPresetName.value = preset.name
    pendingPresetAction.value = 'rename'
    // 使用臨時變數儲存要重新命名的預設ID
    renameTargetPresetId.value = preset.id
    showPresetNameDialog.value = true
  }

  // 要重新命名的預設ID（與編輯預設內容分開）
  const renameTargetPresetId = ref<string | null>(null)

  // 確認重新命名預設
  const confirmRenamePreset = () => {
    if (!editingPresetName.value.trim() || !renameTargetPresetId.value) return

    const preset = gameStore.player.fleetPresets?.find(p => p.id === renameTargetPresetId.value)
    if (preset) {
      preset.name = editingPresetName.value.trim()
    }

    showPresetNameDialog.value = false
    renameTargetPresetId.value = null
    editingPresetName.value = ''
    pendingPresetAction.value = null
  }

  // 刪除預設
  const deletePreset = (presetId: string) => {
    const preset = gameStore.player.fleetPresets?.find(p => p.id === presetId)
    if (!preset) return

    alertDialogTitle.value = t('fleetView.deletePresetTitle')
    alertDialogMessage.value = t('fleetView.deletePresetMessage', { name: preset.name })
    alertDialogCallback.value = () => {
      const index = gameStore.player.fleetPresets?.findIndex(p => p.id === presetId)
      if (index !== undefined && index > -1) {
        gameStore.player.fleetPresets!.splice(index, 1)
      }
    }
    alertDialogOpen.value = true
  }

  // 處理預設名稱對話方塊確認
  const handlePresetNameConfirm = () => {
    if (pendingPresetAction.value === 'save') {
      confirmSavePreset()
    } else if (pendingPresetAction.value === 'rename') {
      confirmRenamePreset()
    }
  }

  // 監聽目標NPC變化，當目標不再是NPC時自動禁用贈送模式
  watch(targetNpc, newValue => {
    if (!newValue && isGiftMode.value) {
      isGiftMode.value = false
    }
  })

  // 計算贈送的預估好感度增加值
  const calculateGiftReputation = (): number => {
    return diplomaticLogic.calculateGiftReputationGain(cargo.value)
  }

  // 可用任務型別
  const availableMissions = computed(() => [
    { type: MissionType.Attack, name: t('fleetView.attackMission'), icon: Sword },
    { type: MissionType.Transport, name: t('fleetView.transport'), icon: Package },
    { type: MissionType.Colonize, name: t('fleetView.colonize'), icon: RocketIcon },
    { type: MissionType.Spy, name: t('fleetView.spy'), icon: Eye },
    { type: MissionType.Deploy, name: t('fleetView.deploy'), icon: Users },
    { type: MissionType.Expedition, name: t('fleetView.expedition'), icon: Compass },
    { type: MissionType.Recycle, name: t('fleetView.recycle'), icon: Recycle },
    { type: MissionType.Destroy, name: t('fleetView.destroy'), icon: Skull }
  ])

  // 獲取任務名稱
  const getMissionName = (type: MissionType): string => {
    const mission = availableMissions.value.find(m => m.type === type)
    return mission?.name || type
  }

  // 獲取星球名稱
  const getPlanetName = (planetId: string): string => {
    const p = gameStore.player.planets.find(p => p.id === planetId)
    return p?.name || t('fleetView.unknownPlanet')
  }

  // 計算總載貨量
  const getTotalCargoCapacity = (): number => {
    let total = 0
    for (const [shipType, count] of Object.entries(selectedFleet.value)) {
      if (count > 0) {
        const config = SHIPS.value[shipType as ShipType]
        total += config.cargoCapacity * count
      }
    }
    return total
  }

  // 計算總貨物
  const getTotalCargo = (): number => {
    return cargo.value.metal + cargo.value.crystal + cargo.value.deuterium + cargo.value.darkMatter
  }

  // 檢查是否有攜帶資源
  const hasCargoResources = (cargoData: Resources): boolean => {
    return cargoData.metal > 0 || cargoData.crystal > 0 || cargoData.deuterium > 0 || cargoData.darkMatter > 0
  }

  // 計算燃料消耗（包含貨物重量影響）
  const getFuelConsumption = (): number => {
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    return shipLogic.calculateFleetFuelConsumption(selectedFleet.value, bonuses.fuelConsumptionReduction, cargo.value)
  }

  // 計算飛行時間
  const getFlightTime = (): number => {
    if (!planet.value) return 0
    const distance = fleetLogic.calculateDistance(planet.value.position, targetPosition.value)
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    const minSpeed = shipLogic.calculateFleetMinSpeed(selectedFleet.value, bonuses.fleetSpeedBonus)
    let flightTime = fleetLogic.calculateFlightTime(distance, minSpeed)

    // 探險任務應用區域飛行時間倍率
    if (selectedMission.value === MissionType.Expedition) {
      const zoneConfig = EXPEDITION_ZONES[selectedExpeditionZone.value]
      flightTime = Math.floor(flightTime * zoneConfig.flightTimeMultiplier)
    }

    return flightTime
  }

  // 檢查是否可以派遣
  const canSendFleet = (): { valid: boolean; errorKey?: string } => {
    // 檢查是否選擇了艦船
    const hasShips = Object.values(selectedFleet.value).some(count => count > 0)
    if (!hasShips) return { valid: false, errorKey: 'fleetView.noShipsSelected' }

    // 檢查是否派遣到自己的星球
    // 回收任務、部署任務和運輸任務除外：
    // - 回收任務：可能回收同位置的殘骸
    // - 部署任務：可能部署到自己的月球
    // - 運輸任務：可能從行星向同位置的月球運輸資源（OGame規則允許）
    if (
      planet.value &&
      selectedMission.value !== MissionType.Recycle &&
      selectedMission.value !== MissionType.Deploy &&
      selectedMission.value !== MissionType.Transport
    ) {
      const isSamePlanet =
        targetPosition.value.galaxy === planet.value.position.galaxy &&
        targetPosition.value.system === planet.value.position.system &&
        targetPosition.value.position === planet.value.position.position
      if (isSamePlanet) {
        return { valid: false, errorKey: 'fleetView.cannotSendToOwnPlanet' }
      }
    }

    // 檢查載貨量
    if (selectedMission.value === MissionType.Transport) {
      if (getTotalCargo() > getTotalCargoCapacity()) {
        return { valid: false, errorKey: 'fleetView.cargoExceedsCapacity' }
      }
    }

    // 檢查殖民船
    if (selectedMission.value === MissionType.Colonize) {
      if (!selectedFleet.value[ShipType.ColonyShip] || (selectedFleet.value[ShipType.ColonyShip] ?? 0) < 1) {
        return { valid: false, errorKey: 'fleetView.noColonyShip' }
      }
    }

    // 檢查回收任務是否有殘骸
    if (selectedMission.value === MissionType.Recycle) {
      const debrisId = `debris_${targetPosition.value.galaxy}_${targetPosition.value.system}_${targetPosition.value.position}`
      const debrisField = universeStore.debrisFields[debrisId]
      if (!debrisField || (debrisField.resources.metal === 0 && debrisField.resources.crystal === 0)) {
        return { valid: false, errorKey: 'fleetView.noDebrisAtTarget' }
      }
    }

    // 檢查毀滅任務是否有死星
    if (selectedMission.value === MissionType.Destroy) {
      if (!selectedFleet.value[ShipType.Deathstar] || (selectedFleet.value[ShipType.Deathstar] ?? 0) < 1) {
        return { valid: false, errorKey: 'fleetView.noDeathstar' }
      }
    }

    return { valid: true }
  }

  const sendFleet = (
    targetPosition: { galaxy: number; system: number; position: number },
    missionType: MissionType,
    fleet: Partial<Fleet>,
    cargo: Resources = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    isMoonTarget: boolean = false
  ): boolean => {
    if (!gameStore.currentPlanet) return false
    const currentMissions = gameStore.player.fleetMissions.length
    const validation = shipValidation.validateFleetDispatch(
      gameStore.currentPlanet,
      fleet,
      cargo,
      gameStore.player.officers,
      currentMissions,
      gameStore.player.technologies
    )
    if (!validation.valid) return false

    // 追蹤燃料消耗（同時計入資源消耗和燃料統計）
    if (validation.fuelNeeded && validation.fuelNeeded > 0) {
      gameLogic.trackResourceConsumption(gameStore.player, { deuterium: validation.fuelNeeded })
      gameLogic.trackFuelConsumption(gameStore.player, validation.fuelNeeded)
    }

    const shouldDeductCargo = missionType === MissionType.Transport
    shipValidation.executeFleetDispatch(gameStore.currentPlanet, fleet, validation.fuelNeeded!, shouldDeductCargo, cargo)
    const distance = fleetLogic.calculateDistance(gameStore.currentPlanet.position, targetPosition)
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, getGameNow())
    const minSpeed = shipLogic.calculateFleetMinSpeed(fleet, bonuses.fleetSpeedBonus)
    let flightTime = fleetLogic.calculateFlightTime(distance, minSpeed)

    // 探險任務應用區域飛行時間倍率
    if (missionType === MissionType.Expedition) {
      const zoneConfig = EXPEDITION_ZONES[selectedExpeditionZone.value]
      flightTime = Math.floor(flightTime * zoneConfig.flightTimeMultiplier)
    }

    const mission = fleetLogic.createFleetMission(
      gameStore.player.id,
      gameStore.currentPlanet.id,
      targetPosition,
      missionType,
      fleet,
      cargo,
      flightTime
    )

    // 如果目標是月球，設定標記
    if (isMoonTarget) {
      mission.targetIsMoon = true
    }

    // 如果是贈送模式，標記任務
    if (missionType === MissionType.Transport && isGiftMode.value && targetNpc.value) {
      mission.isGift = true
      mission.giftTargetNpcId = targetNpc.value.id
    }

    // 如果是探險任務，設定探險區域
    if (missionType === MissionType.Expedition) {
      mission.expeditionZone = selectedExpeditionZone.value
    }

    gameStore.player.fleetMissions.push(mission)
    return true
  }

  // 派遣艦隊
  const handleSendFleet = () => {
    if (!planet.value) return

    // 驗證是否可以派遣
    const validation = canSendFleet()
    if (!validation.valid) {
      alertDialogTitle.value = t('fleetView.sendFailed')
      alertDialogMessage.value = validation.errorKey ? t(validation.errorKey) : t('fleetView.sendFailedMessage')
      alertDialogOpen.value = true
      return
    }

    // 過濾出實際選擇的艦船
    const fleet: Partial<Fleet> = {}
    for (const [shipType, count] of Object.entries(selectedFleet.value)) {
      if (count > 0) {
        fleet[shipType as ShipType] = count
      }
    }

    const success = sendFleet(
      targetPosition.value,
      selectedMission.value,
      fleet,
      selectedMission.value === MissionType.Transport ? cargo.value : undefined,
      targetIsMoon.value
    )

    if (success) {
      // 重置選擇
      Object.keys(selectedFleet.value).forEach(key => {
        selectedFleet.value[key as ShipType] = 0
      })
      cargo.value = { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }
      isGiftMode.value = false
      activeTab.value = 'missions'
    } else {
      alertDialogTitle.value = t('fleetView.sendFailed')
      alertDialogMessage.value = t('fleetView.sendFailedMessage')
      alertDialogOpen.value = true
    }
  }

  const recallFleet = (missionId: string): boolean => {
    const mission = gameStore.player.fleetMissions.find(m => m.id === missionId)
    if (!mission) return false
    return fleetLogic.recallFleetMission(mission, getGameNow())
  }

  // 召回艦隊
  const handleRecallFleet = (missionId: string) => {
    const success = recallFleet(missionId)
    if (!success) {
      alertDialogTitle.value = t('fleetView.recallFailed')
      alertDialogMessage.value = t('fleetView.recallFailedMessage')
      alertDialogCallback.value = null
      alertDialogOpen.value = true
    }
  }

  // 處理終止任務（返航中）
  const handleAbortMission = (missionId: string) => {
    const mission = gameStore.player.fleetMissions.find(m => m.id === missionId)
    if (!mission) return

    // 計算損失資源總量
    const totalResources = mission.cargo.metal + mission.cargo.crystal + mission.cargo.deuterium + mission.cargo.darkMatter

    // 計算艦隊總數
    const totalShips = Object.values(mission.fleet).reduce((sum, count) => sum + count, 0)

    alertDialogTitle.value = t('fleetView.abortMissionTitle')
    alertDialogMessage.value = t('fleetView.abortMissionWarning', {
      ships: totalShips.toString(),
      resources: formatNumber(totalResources)
    })
    alertDialogCallback.value = () => {
      abortMission(missionId)
    }
    alertDialogOpen.value = true
  }

  // 終止任務（不返還任何東西）
  const abortMission = (missionId: string) => {
    const missionIndex = gameStore.player.fleetMissions.findIndex(m => m.id === missionId)
    if (missionIndex > -1) {
      gameStore.player.fleetMissions.splice(missionIndex, 1)
      alertDialogTitle.value = t('fleetView.abortMissionSuccess')
      alertDialogMessage.value = t('fleetView.abortMissionSuccessMessage')
      alertDialogCallback.value = null
      alertDialogOpen.value = true
    }
  }

  // 處理 AlertDialog 確認
  const handleAlertConfirm = () => {
    if (alertDialogCallback.value) {
      alertDialogCallback.value()
      alertDialogCallback.value = null
    }
    alertDialogOpen.value = false
  }

  // 獲取任務剩餘時間
  const getRemainingTime = (mission: any): number => {
    const now = currentTime.value
    const targetTime = mission.status === 'outbound' ? mission.arrivalTime : mission.returnTime
    return Math.max(0, (targetTime - now) / 1000)
  }

  // 獲取任務進度
  const getMissionProgress = (mission: any): number => {
    const now = currentTime.value
    if (mission.status === 'outbound') {
      const total = mission.arrivalTime - mission.departureTime
      const elapsed = now - mission.departureTime
      return Math.max(0, Math.min(100, (elapsed / total) * 100))
    } else {
      const departTime = mission.arrivalTime
      const total = mission.returnTime - departTime
      const elapsed = now - departTime
      return Math.max(0, Math.min(100, (elapsed / total) * 100))
    }
  }

  // 獲取導彈任務剩餘時間
  const getMissileRemainingTime = (missileAttack: any): number => {
    const now = currentTime.value
    return Math.max(0, (missileAttack.arrivalTime - now) / 1000)
  }

  // 獲取導彈任務進度
  const getMissileProgress = (missileAttack: any): number => {
    const now = currentTime.value
    const total = missileAttack.arrivalTime - missileAttack.launchTime
    const elapsed = now - missileAttack.launchTime
    return Math.max(0, Math.min(100, (elapsed / total) * 100))
  }
</script>
