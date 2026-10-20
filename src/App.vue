<template>
  <!-- 首頁：無側邊欄/頭部 -->
  <RouterView v-if="isHomePage" />

  <!-- 其他頁面：完整佈局（含側邊欄） -->
  <SidebarProvider v-else :open="sidebarOpen" @update:open="handleSidebarOpenChange">
    <Sidebar collapsible="icon">
      <!-- 標誌 -->
      <SidebarHeader class="border-b">
        <div class="flex items-center justify-center p-4 group-data-[collapsible=icon]:p-2">
          <img src="@/assets/logo.svg" class="w-10 group-data-[collapsible=icon]:w-8" />
          <h1 class="text-xl font-bold ml-2 group-data-[collapsible=icon]:hidden">{{ pkg.title }}</h1>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <!-- 星球資訊 -->
        <SidebarGroup v-if="planet" class="border-b group-data-[collapsible=icon]:hidden">
          <div class="px-4 py-3 space-y-2 text-sm">
            <!-- 星球切換器 -->
            <Popover>
              <PopoverTrigger as-child>
                <Button
                  data-tutorial="planet-selector"
                  variant="outline"
                  class="w-full justify-between h-auto px-3 py-2.5 border-2 hover:bg-accent hover:border-primary transition-colors"
                >
                  <div class="flex items-start gap-2.5 flex-1 min-w-0">
                    <Globe class="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                    <div class="flex-1 min-w-0 text-left">
                      <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        {{ t('planet.currentPlanet') }}
                      </div>
                      <div class="flex items-center gap-1.5 mb-0.5">
                        <span class="truncate font-semibold text-sm">
                          {{ planet.name }}
                          [{{ planet.position.galaxy }}:{{ planet.position.system }}:{{ planet.position.position }}]
                        </span>
                        <Badge v-if="planet.isMoon" variant="secondary" class="text-[10px] px-1 py-0 h-4">
                          {{ t('planet.moon') }}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <ChevronsUpDown class="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-70 p-0" side="bottom" align="start">
                <div class="p-2">
                  <div class="px-2 py-1.5 mb-1 text-xs font-semibold text-muted-foreground">
                    {{ t('planet.switchPlanet') }}
                  </div>
                  <div class="space-y-0.5 max-h-80 overflow-y-auto">
                    <div v-for="p in gameStore.player.planets" :key="p.id" class="flex items-center gap-1">
                      <Button
                        @click="switchToPlanet(p.id)"
                        :variant="p.id === planet.id ? 'secondary' : 'ghost'"
                        class="flex-1 justify-start h-auto py-2 px-2"
                        size="sm"
                      >
                        <div class="flex items-start gap-2 w-full min-w-0">
                          <Globe class="h-4 w-4 shrink-0 mt-0.5" :class="p.id === planet.id ? 'text-primary' : ''" />
                          <div class="flex-1 min-w-0 text-left">
                            <div class="flex items-center gap-1.5 mb-0.5">
                              <span class="truncate font-medium text-sm">
                                {{ p.name }}
                                [{{ p.position.galaxy }}:{{ p.position.system }}:{{ p.position.position }}]
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-2 w-2 p-0 shrink-0"
                                @click.stop="openRenameDialog(p.id, p.name)"
                                :title="t('planet.renamePlanet')"
                              >
                                <Pencil class="h-2 w-2" />
                              </Button>
                              <Badge v-if="p.isMoon" variant="outline" class="text-[10px] px-1 py-0 h-4">
                                {{ t('planet.moon') }}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <!-- 玩家積分顯示 -->
            <div class="bg-muted/50 rounded-lg p-2">
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">{{ t('player.points') }}</span>
                <span class="text-sm font-bold text-primary">{{ formatNumber(gameStore.player.points) }}</span>
              </div>
            </div>
            <!-- 月球切換按鈕 -->
            <div v-if="hasMoon || planet.isMoon" class="flex gap-1">
              <Button v-if="planet.isMoon" @click="switchToParentPlanet" variant="outline" size="sm" class="w-full text-xs h-7">
                {{ t('planet.backToPlanet') }}
              </Button>
              <Button v-else-if="moon" @click="switchToMoon" variant="outline" size="sm" class="w-full text-xs h-7">
                {{ t('planet.switchToMoon') }}
              </Button>
            </div>
          </div>
        </SidebarGroup>

        <!-- 導航選單 -->
        <SidebarGroup data-tutorial="navigation">
          <SidebarMenu>
            <SidebarMenuItem v-for="item in navItems" :key="item.path">
              <SidebarMenuButton
                :data-nav-path="item.path"
                :is-active="$route.path === item.path"
                :tooltip="item.name.value"
                :disabled="!isFeatureUnlocked(item.path)"
                @click="router.push(item.path)"
              >
                <component :is="item.icon" />
                <span>{{ item.name.value }}</span>
                <!-- 未讀訊息數量 -->
                <SidebarMenuBadge
                  v-if="item.path === '/messages' && unreadMessagesCount > 0"
                  class="bg-destructive text-destructive-foreground"
                >
                  {{ unreadMessagesCount }}
                </SidebarMenuBadge>
                <!-- 正在執行的艦隊任務數量 -->
                <SidebarMenuBadge v-if="item.path === '/fleet' && activeFleetMissionsCount > 0" class="bg-primary text-primary-foreground">
                  {{ activeFleetMissionsCount }}
                </SidebarMenuBadge>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <!-- 底部設定 -->
      <SidebarFooter class="border-t">
        <SidebarMenu>
          <!-- 語言切換 -->
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger as-child>
                <SidebarMenuButton :tooltip="localeNames[gameStore.locale]">
                  <Languages />
                  <span>{{ localeNames[gameStore.locale] }}</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent
                class="w-48 p-2"
                :side="sidebarOpen || innerWidth < 768 ? 'top' : 'right'"
                :align="sidebarOpen || innerWidth < 768 ? 'center' : 'end'"
              >
                <div class="space-y-1">
                  <Button
                    v-for="locale in locales"
                    :key="locale"
                    @click="gameStore.locale = locale"
                    :variant="gameStore.locale === locale ? 'secondary' : 'ghost'"
                    class="w-full justify-start"
                    size="sm"
                  >
                    {{ localeNames[locale] }}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>

          <!-- 夜間模式切換 -->
          <SidebarMenuItem>
            <SidebarMenuButton @click="isDark = !isDark" :tooltip="isDark ? t('sidebar.lightMode') : t('sidebar.darkMode')">
              <Sun v-if="isDark" />
              <Moon v-else />
              <span>{{ isDark ? t('sidebar.lightMode') : t('sidebar.darkMode') }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <!-- 摺疊按鈕 -->
          <SidebarMenuItem class="hidden sm:inline">
            <SidebarMenuButton @click="toggleSidebar" :tooltip="sidebarOpen ? t('sidebar.collapse') : t('sidebar.expand')">
              <ChevronsLeft class="group-data-[state=collapsed]:rotate-180 transition-transform" />
              <span>{{ t('sidebar.collapse') }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    <!-- 主內容區 -->
    <SidebarInset>
      <div class="flex flex-col h-full" :class="Capacitor.isNativePlatform() ? 'pt-[80px]' : 'pt-[60px]'">
        <!-- 頂部資源欄 - 固定定位 -->
        <header
          v-if="planet"
          ref="header"
          class="fixed top-0 right-0 left-0 z-40 bg-card border-b px-4 sm:px-6 shadow-md"
          :class="[
            sidebarOpen ? 'lg:left-[var(--sidebar-width)]' : 'lg:left-[var(--sidebar-width-icon)]',
            Capacitor.isNativePlatform() ? 'py-6' : 'py-3'
          ]"
        >
          <div class="flex flex-col gap-3">
            <!-- 第一行：選單、資源預覽、狀態 -->
            <div
              class="grid items-center gap-3 sm:gap-6"
              style="grid-template-columns: auto 1fr auto"
              :class="{
                'relative top-3': Capacitor.isNativePlatform()
              }"
            >
              <!-- 左側：漢堡選單（移動端）/ 佔位（PC端） -->
              <div>
                <SidebarTrigger class="lg:hidden" data-tutorial="mobile-menu" />
              </div>

              <!-- 資源顯示 - PC端居中，移動端可摺疊 -->
              <!-- 關鍵：min-w-0 + overflow-hidden，避免橫向滾動內容溢位覆蓋左側選單按鈕 -->
              <div class="min-w-0 overflow-hidden">
                <div
                  class="resource-bar flex items-center gap-3 sm:gap-6 justify-start sm:justify-center"
                  :class="[resourceBarExpanded ? 'hidden' : 'overflow-x-auto']"
                >
                  <div v-for="resourceType in resourceTypes" :key="resourceType.key" class="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <ResourceIcon :type="resourceType.key" size="md" :title="t(`resources.${resourceType.key}`)" />
                    <div class="min-w-0">
                      <!-- 電力顯示：當前儲量/最大容量，淨產量/小時 -->
                      <template v-if="resourceType.key === 'energy'">
                        <p
                          class="text-xs sm:text-sm font-medium truncate"
                          :class="getResourceColor(planet.resources.energy, capacity?.energy || Infinity)"
                        >
                          {{ formatNumber(planet.resources.energy) }} /
                          {{ formatNumber(capacity?.energy || 0) }}
                        </p>
                        <p
                          class="text-[10px] sm:text-xs truncate"
                          :class="netEnergy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                        >
                          {{ netEnergy >= 0 ? '+' : '' }}{{ formatNumber(Math.round(netEnergy / 60)) }}/{{ t('resources.perMinute') }}
                        </p>
                      </template>
                      <!-- 其他資源統一顯示：當前值/容量 -->
                      <template v-else>
                        <p
                          class="text-xs sm:text-sm font-medium truncate"
                          :class="getResourceColor(planet.resources[resourceType.key], capacity?.[resourceType.key] || Infinity)"
                        >
                          {{ formatNumber(planet.resources[resourceType.key]) }} /
                          {{ formatNumber(capacity?.[resourceType.key] || 0) }}
                        </p>
                        <p class="text-[10px] sm:text-xs text-muted-foreground truncate">
                          +{{ formatNumber(Math.round((production?.[resourceType.key] || 0) / 60)) }}/{{ t('resources.perMinute') }}
                        </p>
                      </template>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右側：佇列通知 + 展開按鈕 -->
              <div class="flex items-center gap-2 sm:gap-3 shrink-0 justify-end">
                <!-- 移動端展開按鈕 -->
                <Button @click="resourceBarExpanded = !resourceBarExpanded" variant="ghost" size="sm" class="lg:hidden h-8 w-8 p-0">
                  <ChevronDown v-if="!resourceBarExpanded" class="h-4 w-4" />
                  <ChevronUp v-else class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <!-- 展開的資源詳情（僅移動端且展開時顯示） - absolute定位覆蓋在內容上，帶過渡動畫 -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div
            v-if="planet && resourceBarExpanded"
            class="fixed right-0 left-0 z-30 bg-card border-b px-4 py-3 shadow-md lg:hidden"
            :class="[
              sidebarOpen ? 'lg:left-[var(--sidebar-width)]' : 'lg:left-[var(--sidebar-width-icon)]',
              Capacitor.isNativePlatform() ? 'top-[80px]' : 'top-[60px]'
            ]"
          >
            <div class="grid grid-cols-2 gap-3">
              <div v-for="resourceType in resourceTypes" :key="resourceType.key" class="bg-muted/50 rounded-lg p-2.5">
                <div class="flex items-center justify-center gap-2 mb-1.5">
                  <ResourceIcon :type="resourceType.key" size="md" />
                  <span class="text-xs font-medium text-muted-foreground">{{ t(`resources.${resourceType.key}`) }}</span>
                </div>
                <div class="space-y-0.5 text-center">
                  <!-- 電力顯示：當前儲量，容量，淨產量/分鐘 -->
                  <template v-if="resourceType.key === 'energy'">
                    <p class="text-sm font-semibold" :class="getResourceColor(planet.resources.energy, capacity?.energy || Infinity)">
                      {{ formatNumber(planet.resources.energy) }}
                    </p>
                    <p class="text-[10px] text-muted-foreground">
                      {{ t('resources.capacity') }}: {{ formatNumber(capacity?.energy || 0) }}
                    </p>
                    <p
                      class="text-[10px]"
                      :class="netEnergy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                    >
                      {{ t('resources.production') }}: {{ netEnergy >= 0 ? '+' : '' }}{{ formatNumber(Math.round(netEnergy / 60)) }}/{{
                        t('resources.perMinute')
                      }}
                    </p>
                  </template>
                  <!-- 其他資源統一顯示：當前值/容量 -->
                  <template v-else>
                    <p
                      class="text-sm font-semibold"
                      :class="getResourceColor(planet.resources[resourceType.key], capacity?.[resourceType.key] || Infinity)"
                    >
                      {{ formatNumber(planet.resources[resourceType.key]) }}
                    </p>
                    <p class="text-[10px] text-muted-foreground">
                      {{ t('resources.capacity') }}: {{ formatNumber(capacity?.[resourceType.key] || 0) }}
                    </p>
                    <p class="text-[10px] text-muted-foreground">
                      {{ t('resources.production') }}: +{{ formatNumber(Math.round((production?.[resourceType.key] || 0) / 60)) }}/{{
                        t('resources.perMinute')
                      }}
                    </p>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- 即將到來的敵對艦隊警告 -->
        <IncomingFleetAlerts @open-panel="openEnemyAlertPanel" />

        <!-- 低電量警告 -->
        <LowEnergyWarning />

        <!-- 礦脈儲量警告 -->
        <OreDepositWarning />

        <!-- 內容區域 -->
        <main class="flex-1">
          <Transition name="page" mode="out-in">
            <div :key="$route.fullPath" class="h-full">
              <!-- 背景動畫開啟時 -->
              <template v-if="gameStore.player.backgroundEnabled">
                <StarsBackground v-if="isDark" :factor="0.05" :speed="50" star-color="#fff" class="h-full">
                  <div class="relative z-10 h-full">
                    <RouterView />
                  </div>
                </StarsBackground>

                <div v-else class="relative h-full w-full overflow-hidden">
                  <div class="relative z-10 h-full">
                    <RouterView />
                  </div>

                  <ParticlesBg class="absolute inset-0 z-0" :quantity="100" :ease="100" color="#000" :staticity="10" refresh />
                </div>
              </template>

              <!-- 背景動畫關閉時 -->
              <div v-else class="h-full">
                <RouterView />
              </div>
            </div>
          </Transition>
        </main>
      </div>
    </SidebarInset>

    <!-- 右下角固定通知按鈕 -->
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2" :class="{ 'bottom-15': Capacitor.isNativePlatform() }">
      <!-- 返回頂部 -->
      <BackToTop />
      <!-- 佇列通知 -->
      <QueueNotifications />

      <!-- 外交通知 -->
      <DiplomaticNotifications />

      <!-- 敵方警報 -->
      <EnemyAlertNotifications ref="enemyAlertNotificationsRef" />
    </div>

    <!-- 確認對話方塊 -->
    <AlertDialog :open="confirmDialogOpen" @update:open="confirmDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ confirmDialogTitle }}</AlertDialogTitle>
          <AlertDialogDescription class="whitespace-pre-line">
            {{ confirmDialogMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="handleConfirmDialogConfirm">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <!-- 詳情彈窗 -->
    <DetailDialog />
    <!-- 更新彈窗 -->
    <UpdateDialog v-model:open="showUpdateDialog" :version-info="updateInfo" />
    <!-- 弱引導提示系統 -->
    <HintToast />
    <!-- Toast 通知 -->
    <Sonner position="top-center" />
    <!-- 重新命名星球對話方塊 -->
    <Dialog v-model:open="renameDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('planet.renamePlanetTitle') }}</DialogTitle>
          <DialogDescription class="sr-only">{{ t('planet.renamePlanetTitle') }}</DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Input v-model="newPlanetName" :placeholder="t('planet.planetNamePlaceholder')" @keyup.enter="confirmRenamePlanet" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="renameDialogOpen = false">
            {{ t('common.cancel') }}
          </Button>
          <Button @click="confirmRenamePlanet" :disabled="!newPlanetName.trim()">
            {{ t('planet.rename') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SidebarProvider>

  <!-- 新遊戲取名對話方塊（放根層級：歡迎頁無側邊欄，放在 SidebarProvider 內不會渲染） -->
  <Dialog :open="newGameDialogOpen" @update:open="(open: boolean) => { if (!open && newGameNameResolve) confirmNewGame() }">
    <DialogContent class="sm:max-w-md" :show-close-button="false">
      <DialogHeader>
        <DialogTitle>{{ t('newGame.title') }}</DialogTitle>
        <DialogDescription>{{ t('newGame.description') }}</DialogDescription>
      </DialogHeader>
      <div class="py-4">
        <Input v-model="newPlayerName" :placeholder="t('newGame.namePlaceholder')" maxlength="24" @keyup.enter="confirmNewGame" autofocus />
      </div>
      <DialogFooter>
        <Button @click="confirmNewGame">
          {{ t('newGame.start') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Android 退出確認對話方塊 -->
  <AlertDialog v-model:open="exitDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('common.exitConfirmTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('common.exitConfirmMessage') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="exitApp">{{ t('common.confirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- NPC 名稱更新確認對話方塊 -->
  <AlertDialog v-model:open="npcNameUpdateDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('settings.npcNameUpdateTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('settings.npcNameUpdateMessage', { count: oldFormatNPCCount }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleSkipNPCNameUpdate">{{ t('settings.npcNameUpdateCancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="handleUpdateNPCNames">{{ t('settings.npcNameUpdateConfirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- 副官付費制遷移確認門（v2→v3；文案走 autopilot.contract.* i18n） -->
  <AlertDialog v-model:open="billingGateOpen">
    <AlertDialogContent @escape-key-down="onBillingGateEscape">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ billingGateConfirmMode ? t('autopilot.contract.billingGateConfirmTitle') : t('autopilot.contract.billingGateNoticeTitle') }}</AlertDialogTitle>
        <AlertDialogDescription class="whitespace-pre-line">{{
          billingGateConfirmMode ? t('autopilot.contract.billingGateConfirmBody') : t('autopilot.contract.billingGateNoticeBody')
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <template v-if="billingGateConfirmMode">
          <AlertDialogCancel @click="handleBillingGateChoice('pause')">{{ t('autopilot.contract.billingGatePause') }}</AlertDialogCancel>
          <AlertDialogAction @click="handleBillingGateChoice('continue')">{{ t('autopilot.contract.billingGateContinue') }}</AlertDialogAction>
        </template>
        <AlertDialogAction v-else @click="handleBillingNoticeDismiss">{{ t('autopilot.contract.billingGateAcknowledge') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, computed, ref, watch, provide } from 'vue'
  import { RouterView, useRouter } from 'vue-router'
  import { useGameStore } from '@/stores/gameStore'
  import { useUniverseStore } from '@/stores/universeStore'
  import { useNPCStore } from '@/stores/npcStore'
  import { useTheme } from '@/composables/useTheme'
  import { useI18n } from '@/composables/useI18n'
  import { useGameConfig } from '@/composables/useGameConfig'
  import { localeNames, detectBrowserLocale, type Locale } from '@/locales'
  import { Button } from '@/components/ui/button'
  import { Badge } from '@/components/ui/badge'
  import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
  import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
  import { Input } from '@/components/ui/input'
  import IncomingFleetAlerts from '@/components/notifications/IncomingFleetAlerts.vue'
  import LowEnergyWarning from '@/components/notifications/LowEnergyWarning.vue'
  import OreDepositWarning from '@/components/notifications/OreDepositWarning.vue'
  import DiplomaticNotifications from '@/components/notifications/DiplomaticNotifications.vue'
  import EnemyAlertNotifications from '@/components/notifications/EnemyAlertNotifications.vue'
  import QueueNotifications from '@/components/notifications/QueueNotifications.vue'
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger
  } from '@/components/ui/sidebar'
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
  import DetailDialog from '@/components/dialogs/DetailDialog.vue'
  import UpdateDialog from '@/components/dialogs/UpdateDialog.vue'
  import HintToast from '@/components/notifications/HintToast.vue'
  import BackToTop from '@/components/common/BackToTop.vue'
  import Sonner from '@/components/ui/sonner/Sonner.vue'
  import { MissionType, BuildingType, TechnologyType, DiplomaticEventType, ShipType, DefenseType } from '@/types/game'
  import type { FleetMission, NPC, MissileAttack } from '@/types/game'
  import { DIPLOMATIC_CONFIG } from '@/config/gameConfig'
  import type { VersionInfo } from '@/utils/versionCheck'
  import { formatNumber, getResourceColor } from '@/utils/format'
  import { scaleNumber, scaleResources } from '@/utils/speed'
  import {
    Moon,
    Sun,
    Home,
    Building2,
    FlaskConical,
    Ship,
    Rocket,
    Shield,
    Mail,
    Globe,
    Users,
    Swords,
    Languages,
    Settings,
    Wrench,
    ChevronsLeft,
    ChevronsUpDown,
    ChevronDown,
    ChevronUp,
    Handshake,
    Pencil,
    Trophy,
    Crown,
    Scroll,
    Bot
  } from 'lucide-vue-next'
  import * as gameLogic from '@/logic/gameLogic'
  import * as autopilotLogic from '@/logic/autopilotLogic'
  import * as autopilotBilling from '@/logic/autopilotBilling'
  import * as autopilotAlerts from '@/logic/autopilotAlerts'
  import { selectNewExpeditionReminders } from '@/logic/autopilotExpeditions'
  import { deliverAutopilotNotifications, type AutopilotNotification } from '@/logic/autopilotNotifications'
  import {
    applyBillingConfirmation,
    dismissBillingNotice,
    shouldShowBillingConfirm,
    shouldShowBillingNotice,
    type BillingConfirmChoice
  } from '@/logic/autopilotBilling'
  import { getGameNow, setTimeOffset } from '@/logic/gameTime'
  import * as planetLogic from '@/logic/planetLogic'
  import * as officerLogic from '@/logic/officerLogic'
  import * as buildingValidation from '@/logic/buildingValidation'
  import * as resourceLogic from '@/logic/resourceLogic'
  import * as researchValidation from '@/logic/researchValidation'
  import * as fleetLogic from '@/logic/fleetLogic'
  import * as shipLogic from '@/logic/shipLogic'
  import * as npcGrowthLogic from '@/logic/npcGrowthLogic'
  import * as npcBehaviorLogic from '@/logic/npcBehaviorLogic'
  import * as diplomaticLogic from '@/logic/diplomaticLogic'
  import * as publicLogic from '@/logic/publicLogic'
  import * as oreDepositLogic from '@/logic/oreDepositLogic'
  import * as campaignLogic from '@/logic/campaignLogic'
  import { generateNPCName, countOldFormatNPCs, updateNPCName, resolveNPCNameLocale } from '@/logic/npcNameGenerator'
  import pkg from '../package.json'
  import { toast } from 'vue-sonner'
  import { migrateGameData } from '@/utils/migration'
  import { checkLatestVersion } from '@/utils/versionCheck'
  import { StarsBackground } from '@/components/ui/bg-stars'
  import { ParticlesBg } from '@/components/ui/particles-bg'
  import { App as CapacitorApp } from '@capacitor/app'
  import { Capacitor } from '@capacitor/core'

  // 執行資料遷移（在 store 初始化之前）
  migrateGameData()

  const router = useRouter()
  const gameStore = useGameStore()
  watch(() => gameStore.timeOffset, offset => setTimeOffset(offset || 0), { immediate: true, flush: 'sync' })
  // 離開歡迎頁（使用者按了「開始遊戲」）後，若新遊戲待取名則彈出取名對話方塊；
  // 直接用網址進入遊戲頁（初始路由即非 /）也同樣觸發
  watch(() => router.currentRoute.value.path, (path) => {
    if (path !== '/' && pendingNamePrompt.value) {
      pendingNamePrompt.value = false
      const nameAtPrompt = gameStore.player.name
      try {
        askPlayerName().then(name => {
          if (gameStore.player.name === nameAtPrompt) {
            gameStore.player.name = name
          }
        }).catch(() => {})
      } catch { /* 對話方塊失敗也不影響遊戲 */ }
    }
  }, { immediate: true })
  const universeStore = useUniverseStore()
  const npcStore = useNPCStore()
  const { isDark } = useTheme()
  const { t } = useI18n()
  const { BUILDINGS, TECHNOLOGIES } = useGameConfig()
  const enemyAlertNotificationsRef = ref<InstanceType<typeof EnemyAlertNotifications> | null>(null)
  // ConfirmDialog 狀態
  const confirmDialogOpen = ref(false)
  const confirmDialogTitle = ref('')
  const confirmDialogMessage = ref('')
  const innerWidth = computed(() => window.innerWidth)
  const confirmDialogAction = ref<(() => void) | null>(null)
  // 更新彈窗狀態
  const showUpdateDialog = ref(false)
  const updateInfo = ref<VersionInfo | null>(null)
  // 所有可用的語言選項
  const locales: Locale[] = ['zh-CN', 'zh-TW', 'en', 'de', 'ru', 'es-LA', 'ko', 'ja']
  // 側邊欄狀態（不持久化，根據螢幕尺寸初始化）
  // PC端（≥1024px）預設開啟，移動端預設關閉
  const sidebarOpen = ref(window.innerWidth >= 1024)
  // 移動端資源欄展開狀態
  const resourceBarExpanded = ref(false)
  const npcUpdateCounter = ref(0) // 累計秒數
  const NPC_UPDATE_INTERVAL = 5 // 每1秒更新一次NPC，確保發育速度與玩家相當
  // NPC行為系統更新函式（偵查和攻擊決策）
  const npcBehaviorCounter = ref(0)
  const NPC_BEHAVIOR_INTERVAL = 5 // 每5秒檢查一次NPC行為

  // 自動成長副官：最近一次 tick 結果（按星球 id；帝國研究用 '__empire__'），供副官檢視展示阻塞原因
  const autopilotTickResults = ref(
    new Map<string, autopilotLogic.AutopilotTickResult | autopilotLogic.EmpireResearchTickResult>()
  )
  provide('autopilotTickResults', autopilotTickResults)
  provide('openIncomingFleetAlerts', () => openEnemyAlertPanel())
  let autopilotAlertState = new Map<string, autopilotAlerts.AlertNotificationState>()
  let expeditionReminderState = new Set<string>()

  const notifyAutopilot = (title: string, body: string) => {
    const settings = gameStore.notificationSettings
    if (settings.inApp) toast.warning(title, { description: body })
    if (settings.browser && 'Notification' in window && Notification.permission === 'granted' &&
      !(settings.suppressInFocus && document.hasFocus())) {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  }

  // 遊戲迴圈定時器
  const gameLoop = ref<ReturnType<typeof setInterval> | null>(null)
  const pointsUpdateInterval = ref<ReturnType<typeof setInterval> | null>(null)
  const konamiCleanup = ref<(() => void) | null>(null)
  const versionCheckInterval = ref<ReturnType<typeof setInterval> | null>(null) // 重新命名星球相關狀態
  const renameDialogOpen = ref(false)
  const renamingPlanetId = ref<string | null>(null)
  const newPlanetName = ref('')
  // 新遊戲取名對話方塊狀態
  const newGameDialogOpen = ref(false)
  const newPlayerName = ref('')
  let newGameNameResolve: ((name: string) => void) | null = null
  // 新遊戲待取名：init 時只標記，等使用者按「開始遊戲」離開歡迎頁後才彈對話方塊
  const pendingNamePrompt = ref(false)
  // Android 退出確認對話方塊狀態
  const exitDialogOpen = ref(false)
  // NPC 名稱更新對話方塊狀態
  const npcNameUpdateDialogOpen = ref(false)
  const oldFormatNPCCount = ref(0)
  // 副官付費制遷移確認門（v2→v3）：舊存檔有用副官 → 確認門；其餘舊存檔 → 一次性新制說明
  const billingGateOpen = ref(false)
  const billingGateConfirmMode = ref(true)
  // 功能解鎖要求配置
  const featureRequirements: Record<string, { building: BuildingType; level: number }> = {
    '/research': { building: BuildingType.ResearchLab, level: 1 },
    '/shipyard': { building: BuildingType.Shipyard, level: 1 },
    '/defense': { building: BuildingType.Shipyard, level: 1 },
    '/fleet': { building: BuildingType.Shipyard, level: 1 },
    '/officers': { building: BuildingType.Shipyard, level: 1 }
  }

  // 判斷是否為首頁
  const isHomePage = computed(() => router.currentRoute.value.path === '/')

  // 定義 planet computed（需要在 watch 之前定義）
  const planet = computed(() => gameStore.currentPlanet)

  // 資源型別配置
  const resourceTypes = [
    { key: 'metal' as const },
    { key: 'crystal' as const },
    { key: 'deuterium' as const },
    { key: 'energy' as const },
    { key: 'darkMatter' as const }
  ]

  const navItems = computed(() => [
    { name: computed(() => t('nav.overview')), path: '/overview', icon: Home },
    { name: computed(() => t('nav.buildings')), path: '/buildings', icon: Building2 },
    { name: computed(() => t('nav.research')), path: '/research', icon: FlaskConical },
    { name: computed(() => t('nav.shipyard')), path: '/shipyard', icon: Ship },
    { name: computed(() => t('nav.defense')), path: '/defense', icon: Shield },
    { name: computed(() => t('nav.fleet')), path: '/fleet', icon: Rocket },
    { name: computed(() => t('nav.officers')), path: '/officers', icon: Users },
    { name: computed(() => t('nav.simulator')), path: '/battle-simulator', icon: Swords },
    { name: computed(() => t('nav.galaxy')), path: '/galaxy', icon: Globe },
    { name: computed(() => t('nav.diplomacy')), path: '/diplomacy', icon: Handshake },
    { name: computed(() => t('nav.achievements')), path: '/achievements', icon: Trophy },
    { name: computed(() => t('nav.campaign')), path: '/campaign', icon: Scroll },
    { name: computed(() => t('nav.ranking')), path: '/ranking', icon: Crown },
    { name: computed(() => t('nav.messages')), path: '/messages', icon: Mail },
    { name: computed(() => t('nav.settings')), path: '/settings', icon: Settings },
    { name: computed(() => t('nav.autopilot')), path: '/autopilot', icon: Bot },
    // GM選單在啟用GM模式時顯示
    ...(gameStore.player.isGMEnabled ? [{ name: computed(() => t('nav.gm')), path: '/gm', icon: Wrench }] : [])
  ])

  // 使用直接計算，不再快取
  const production = computed(() => {
    if (!planet.value) return null
    const now = getGameNow()
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
    const base = resourceLogic.calculateResourceProduction(planet.value, {
      resourceProductionBonus: bonuses.resourceProductionBonus,
      darkMatterProductionBonus: bonuses.darkMatterProductionBonus,
      energyProductionBonus: bonuses.energyProductionBonus
    })
    return scaleResources(base, gameStore.gameSpeed)
  })

  const capacity = computed(() => {
    if (!planet.value) return null
    const now = getGameNow()
    const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
    return resourceLogic.calculateResourceCapacity(planet.value, bonuses.storageCapacityBonus)
  })

  // 電力消耗
  const energyConsumption = computed(() => {
    if (!planet.value) return 0
    return scaleNumber(resourceLogic.calculateEnergyConsumption(planet.value), gameStore.gameSpeed)
  })

  // 淨電力（產量 - 消耗）
  const netEnergy = computed(() => {
    if (!planet.value || !production.value) return 0
    return production.value.energy - energyConsumption.value
  })

  // 未讀訊息數量
  const unreadMessagesCount = computed(() => {
    const unreadBattles = gameStore.player.battleReports.filter(r => !r.read).length
    const unreadSpies = gameStore.player.spyReports.filter(r => !r.read).length
    const unreadSpied = gameStore.player.spiedNotifications?.filter(n => !n.read).length || 0
    const unreadMissions = gameStore.player.missionReports?.filter(r => !r.read).length || 0
    const unreadNPCActivity = gameStore.player.npcActivityNotifications?.filter(n => !n.read).length || 0
    const unreadGifts = gameStore.player.giftNotifications?.filter(n => !n.read).length || 0
    const unreadGiftRejected = gameStore.player.giftRejectedNotifications?.filter(n => !n.read).length || 0
    const unreadTradeOffers = gameStore.player.tradeOffers?.filter(o => !o.read).length || 0
    const unreadIntelReports = gameStore.player.intelReports?.filter(r => !r.read).length || 0
    const unreadJointAttacks = gameStore.player.jointAttackInvites?.filter(i => !i.read).length || 0
    return (
      unreadBattles +
      unreadSpies +
      unreadSpied +
      unreadMissions +
      unreadNPCActivity +
      unreadGifts +
      unreadGiftRejected +
      unreadTradeOffers +
      unreadIntelReports +
      unreadJointAttacks
    )
  })

  // 正在執行的艦隊任務數量（包括飛行中的導彈）
  const activeFleetMissionsCount = computed(() => {
    const fleetMissions = gameStore.player.fleetMissions.filter(m => m.status === 'outbound' || m.status === 'returning').length
    const flyingMissiles = gameStore.player.missileAttacks?.filter(m => m.status === 'flying').length || 0
    return fleetMissions + flyingMissiles
  })

  // 月球相關
  const moon = computed(() => {
    if (!planet.value || planet.value.isMoon) return null
    return gameStore.getMoonForPlanet(planet.value.id)
  })

  const hasMoon = computed(() => !!moon.value)

  const handleNotification = (type: string, itemType: string, level?: number) => {
    const settings = gameStore.notificationSettings
    if (!settings) return

    // 檢查主開關
    if (!settings.browser && !settings.inApp) return

    // 檢查具體型別開關
    let typeKey: 'construction' | 'research'
    let title = ''
    let body = ''

    if (type === 'building') {
      typeKey = 'construction'
      const buildingType = itemType as BuildingType
      const name = BUILDINGS.value[buildingType]?.name || itemType
      title = t('notifications.constructionComplete')
      body = `${name} Lv ${level}`
    } else if (type === 'technology') {
      typeKey = 'research'
      const technologyType = itemType as TechnologyType
      const name = TECHNOLOGIES.value[technologyType]?.name || itemType
      title = t('notifications.researchComplete')
      body = `${name} Lv ${level}`
    } else {
      return
    }

    if (!settings.types[typeKey as keyof typeof settings.types]) return

    // 瀏覽器通知
    if (settings.browser && 'Notification' in window && Notification.permission === 'granted') {
      const shouldSuppress = settings.suppressInFocus && document.hasFocus()
      if (!shouldSuppress) {
        new Notification(title, { body, icon: '/favicon.ico' })
      }
    }

    // 頁面內 toast 通知
    if (settings.inApp) {
      toast.success(title, { description: body })
    }
  }

  // 處理解鎖通知
  const handleUnlockNotification = (unlockedItems: Array<{ type: 'building' | 'technology'; id: string; name: string }>) => {
    const settings = gameStore.notificationSettings
    if (!settings) return

    // 檢查主開關和解鎖型別開關
    if (!settings.browser && !settings.inApp) return
    if (!settings.types.unlock) return

    unlockedItems.forEach(item => {
      const title = t('notifications.newUnlock')
      const typeLabel = item.type === 'building' ? t('notifications.building') : t('notifications.technology')
      const body = `${typeLabel}: ${item.name}`

      // 瀏覽器通知
      if (settings.browser && 'Notification' in window && Notification.permission === 'granted') {
        const shouldSuppress = settings.suppressInFocus && document.hasFocus()
        if (!shouldSuppress) {
          new Notification(title, { body, icon: '/favicon.ico' })
        }
      }

      // 頁面內 toast 通知
      if (settings.inApp) {
        toast.info(title, { description: body })
      }
    })
  }

  const handleConfirmDialogConfirm = () => {
    if (confirmDialogAction.value) {
      confirmDialogAction.value()
    }
    confirmDialogOpen.value = false
  }

  const initGame = async () => {
    const shouldInit = gameLogic.shouldInitializeGame(gameStore.player.planets)
    if (!shouldInit) {
      const now = getGameNow()
      // 遷移礦脈儲量資料（為沒有礦脈資料的星球初始化）
      gameStore.player.planets.forEach(planet => {
        oreDepositLogic.migrateOreDeposits(planet)
      })
      // 遷移NPC星球的礦脈儲量
      npcStore.npcs.forEach(npc => {
        npc.planets.forEach(planet => {
          oreDepositLogic.migrateOreDeposits(planet)
        })
      })
      // 遷移宇宙地圖中的星球（NPC星球的副本）
      Object.values(universeStore.planets).forEach(planet => {
        oreDepositLogic.migrateOreDeposits(planet)
      })

      // 計算離線收益（直接同步計算，應用遊戲速度）
      const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
      const miningTechLevel = gameStore.player.technologies[TechnologyType.MiningTechnology] || 0
      const techBonuses = {
        mineralResearchLevel: gameStore.player.technologies[TechnologyType.MineralResearch] || 0,
        crystalResearchLevel: gameStore.player.technologies[TechnologyType.CrystalResearch] || 0,
        fuelResearchLevel: gameStore.player.technologies[TechnologyType.FuelResearch] || 0
      }
      gameStore.player.planets.forEach(planet => {
        resourceLogic.updatePlanetResources(planet, now, bonuses, gameStore.gameSpeed, miningTechLevel, techBonuses)
      })

      // 只在沒有NPC星球時才生成（首次載入已有玩家資料時）
      if (Object.keys(universeStore.planets).length === 0) {
        generateNPCPlanets()
      }

      // 資料遷移：為沒有 bonusPoints 的玩家計算獎勵積分
      if (gameStore.player.bonusPoints === undefined) {
        // 計算基礎積分（建築、科技、艦船、防禦）
        let totalCost = 0
        gameStore.player.planets.forEach(planet => {
          Object.entries(planet.buildings).forEach(([buildingType, level]) => {
            totalCost += publicLogic.calculateBuildingTotalCost(buildingType as BuildingType, level)
          })
          Object.entries(planet.fleet).forEach(([shipType, count]) => {
            totalCost += publicLogic.calculateShipUnitCost(shipType as ShipType) * count
          })
          Object.entries(planet.defense).forEach(([defenseType, count]) => {
            totalCost += publicLogic.calculateDefenseUnitCost(defenseType as DefenseType) * count
          })
        })
        Object.entries(gameStore.player.technologies).forEach(([techType, level]) => {
          totalCost += publicLogic.calculateTechnologyTotalCost(techType as TechnologyType, level)
        })
        const basePoints = Math.floor(totalCost / 1000)
        // bonusPoints = 當前積分 - 基礎積分
        gameStore.player.bonusPoints = Math.max(0, gameStore.player.points - basePoints)
      }

      // 初始化或更新玩家積分
      gameStore.player.points = publicLogic.calculatePlayerPoints(gameStore.player)

      return
    }
    // 新遊戲：先以預設名初始化；取名對話方塊等使用者按「開始遊戲」進入遊戲後才彈（pendingNamePrompt 標記）
    gameStore.player = gameLogic.initializePlayer(gameStore.player.id, t('common.playerName'))
    pendingNamePrompt.value = true
    const initialPlanet = planetLogic.createInitialPlanet(gameStore.player.id, t('planet.homePlanet'))
    gameStore.player.planets = [initialPlanet]
    gameStore.currentPlanetId = initialPlanet.id
    // 新玩家初始化時生成NPC星球
    generateNPCPlanets()
    // 初始化玩家積分
    gameStore.player.points = publicLogic.calculatePlayerPoints(gameStore.player)
  }

  const generateNPCPlanets = () => {
    const npcCount = 200
    for (let i = 0; i < npcCount; i++) {
      const position = gameLogic.generateRandomPosition()
      const key = gameLogic.generatePositionKey(position.galaxy, position.system, position.position)
      if (universeStore.planets[key]) continue
      const npcPlanet = planetLogic.createNPCPlanet(i, position, t('planet.planetPrefix'))
      universeStore.planets[key] = npcPlanet
    }
  }

  // 遊戲主更新：推進到指定時間點（now 為虛擬遊戲時間）
  // silent 模式用於時間快轉：通知按型別聚合為一條彙總 toast，NPC 行為決策跳過
  // v3 副官計費基線：上次 tick 的 now；首個 tick 只建基線不計費，
  // 避免把歷史累積的 timeOffset（快轉/離線）當成一次補算
  let lastBillingTickNow: number | null = null
  const updateGameAt = async (now: number, opts?: { silent?: boolean; hours?: number }) => {
    const silent = opts?.silent ?? false
    if (gameStore.isPaused) return
    gameStore.gameTime = now
    // 檢查軍官過期
    gameLogic.checkOfficersExpiration(gameStore.player.officers, now)

    // 靜默模式：收集完成計數與解鎖項，結束後統一彙總（避免逐條 toast 轟炸）
    const skipStats = { buildings: 0, researches: 0, ships: 0, defenses: 0, unlocks: 0 }
    const autopilotSummary: string[] = []
    const aggregateNotification = (type: string, _itemType: string, _level?: number, quantity?: number) => {
      if (type === 'building') skipStats.buildings += 1
      else if (type === 'technology') skipStats.researches += 1
      else if (type === 'ship') skipStats.ships += quantity ?? 0
      else if (type === 'defense') skipStats.defenses += quantity ?? 0
    }
    const aggregateUnlockNotification = (unlockedItems: Array<{ type: 'building' | 'technology'; id: string; name: string }>) => {
      skipStats.unlocks += unlockedItems.length
    }

    // 處理遊戲更新（建造佇列、研究佇列等）
    const result = gameLogic.processGameUpdate(
      gameStore.player,
      now,
      gameStore.gameSpeed,
      silent ? aggregateNotification : handleNotification,
      silent ? aggregateUnlockNotification : handleUnlockNotification
    )
    gameStore.player.researchQueue = result.updatedResearchQueue

    // M1 自動成長副官 tick：線上 tick 與快轉各推進一次（離線返回不追補，靠等待佇列自然推進）
    // Minor-12：逐星球 try/catch，單星球異常不影響其他星球與帝國研究
    {
      const officerBonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
      const autopilotCtx: autopilotLogic.AutopilotContext = {
        buildSpeedBonus: officerBonuses.buildingSpeedBonus,
        additionalBuildQueue: officerBonuses.additionalBuildQueue,
        energyProductionBonus: officerBonuses.energyProductionBonus,
        energyBonusExpiresAt: officerLogic.getEnergyBonusExpiresAt(gameStore.player.officers, now), // MAJ-7
        storageCapacityBonus: officerBonuses.storageCapacityBonus,
        researchSpeedBonus: officerBonuses.researchSpeedBonus
      }
      gameStore.player.planets.forEach(planet => {
        try {
          const tickResult = autopilotLogic.tickAutopilotPlanet(gameStore.player, planet, now, autopilotCtx)
          autopilotTickResults.value.set(planet.id, tickResult)
        } catch (error) {
          console.error(`[autopilot] tick failed for planet ${planet.id}:`, error)
        }
      })
      try {
        const researchTickResult = autopilotLogic.tickEmpireResearch(gameStore.player, now, autopilotCtx)
        autopilotTickResults.value.set('__empire__', researchTickResult)
      } catch (error) {
        console.error('[autopilot] empire research tick failed:', error)
      }
    }

    // v3 副官計費（Phase 2）：每個 tick 若合約 active 則累加計費秒（增量 = 虛擬秒 × 當下 gameSpeed，
    // 不監聽速度切換事件，tick 讀到的 gameSpeed 即真相來源）；每滿 60 計費秒按當期費率結算一分鐘。
    // 快轉 tick（silent）跳過計費（比照離線）；離線補算入口不經過 updateGameAt，自然不收費。
    // 餘額不足 → 合約轉 paused_funds，後續副官工作由執行守衛自然停止（已開工項不受影響）。
    // B-2：paused_funds + autoRenew 的合約也進 tick，由 processBillingTick 在資源補足時自動恢復 active。
    if (lastBillingTickNow === null) {
      lastBillingTickNow = now
    } else {
      const contract = gameStore.player.autopilotContract
      const virtualSeconds = Math.max(0, (now - lastBillingTickNow) / 1000)
      const billingTickNeeded = contract !== undefined && (
        autopilotBilling.canAutopilotWork(contract) ||
        (contract.status === 'paused_funds' && contract.autoRenew)
      )
      if (contract && billingTickNeeded) {
        const payerPlanet = gameStore.player.planets.find(p => p.id === contract.payerPlanetId)
        if (payerPlanet) {
          const billingBonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
          const serviceInputs = gameStore.player.planets
            .filter(p => contract.servicePlanetIds.includes(p.id))
            .map(p => autopilotBilling.toBillingPlanetInput(p, billingBonuses.energyProductionBonus))
          const billingResult = autopilotBilling.processBillingTick(contract, {
            virtualSeconds,
            gameSpeed: gameStore.gameSpeed,
            isFastForward: silent,
            servicePlanetInputs: serviceInputs,
            payerResources: payerPlanet.resources
          })
          if (billingResult.autoResumed) {
            // B-2：自動續費恢復是當 tick 的一次性事件，不會刷屏
            toast.success(t('autopilot.contract.autoRenewedToast'))
          }
          if (billingResult.pausedForFunds) {
            console.warn('[autopilot-billing] 付款星球餘額不足，合約已暫停（paused_funds）')
            // Phase 4：餘額不足暫停是當 tick 的一次性事件（pausedForFunds 只在轉入瞬間為 true），
            // 直接彈 toast 提醒使用者去副官頁補充資源，不會刷屏
            toast.warning(t('autopilot.contract.fundsPausedToast'))
          }
        } else if (contract.status === 'active') {
          // M-4：找不到付款星球 → 視為餘額不足暫停（防禦性，避免靜默免單）；
          // 已暫停時不再重複告警（本就暫停，不會計費）
          console.warn('[autopilot-billing] 找不到付款星球，合約轉暫停（paused_funds）', contract.payerPlanetId)
          contract.status = 'paused_funds'
        }
      }
      lastBillingTickNow = now
    }

    {
      const context = autopilotAlerts.createForecastContext(gameStore.player, gameStore.gameSpeed, now)
      const { fresh, state } = autopilotAlerts.selectNewAlerts(
        autopilotAlerts.collectAutopilotAlerts(gameStore.player, context), autopilotAlertState, now
      )
      autopilotAlertState = state
      const notifications: AutopilotNotification[] = []
      for (const alert of fresh) {
        const name = gameStore.player.planets.find(planet => planet.id === alert.planetId)?.name ?? alert.planetId
        notifications.push({
          title: t(`autopilot.alert${alert.type}`),
          description: t('autopilot.alertDetail', {
            planet: name, resource: alert.resource ? t(`resources.${alert.resource}`) : t('resources.energy'),
            hours: alert.hoursLeft.toFixed(1)
          })
        })
      }
      const expeditions = selectNewExpeditionReminders(gameStore.player, now, expeditionReminderState)
      expeditionReminderState = expeditions.state
      for (const reminder of expeditions.fresh) {
        const name = gameStore.player.planets.find(planet => planet.id === reminder.planetId)?.name ?? reminder.planetId
        notifications.push({
          title: t('autopilot.expeditionReturn'),
          description: t('autopilot.expeditionDetail', {
            planet: name, minutes: Math.ceil(reminder.minutesLeft)
          })
        })
      }
      autopilotSummary.push(...deliverAutopilotNotifications(notifications, silent, notifyAutopilot))
    }

    // 處理艦隊任務
    gameStore.player.fleetMissions.forEach(mission => {
      if (mission.status === 'outbound' && now >= mission.arrivalTime) {
        processMissionArrival(mission, now)
      } else if (mission.status === 'returning' && mission.returnTime && now >= mission.returnTime) {
        processMissionReturn(mission)
      }
    })

    // 處理導彈攻擊任務（使用反向迴圈以便安全刪除）
    for (let i = gameStore.player.missileAttacks.length - 1; i >= 0; i--) {
      const missileAttack = gameStore.player.missileAttacks[i]
      if (missileAttack && missileAttack.status === 'flying' && now >= missileAttack.arrivalTime) {
        await processMissileAttackArrival(missileAttack, now)
        // 導彈攻擊是單程的，到達後直接從陣列中移除
        gameStore.player.missileAttacks.splice(i, 1)
      }
    }

    // 處理NPC艦隊任務
    npcStore.npcs.forEach(npc => {
      if (npc.fleetMissions) {
        npc.fleetMissions.forEach(mission => {
          if (mission.status === 'outbound' && now >= mission.arrivalTime) {
            processNPCMissionArrival(npc, mission, now)
          } else if (mission.status === 'returning' && mission.returnTime && now >= mission.returnTime) {
            processNPCMissionReturn(npc, mission)
          }
        })
      }
    })

    // NPC成長系統更新（快轉時按跳躍時長一次性成長）
    updateNPCGrowth(silent && opts?.hours ? opts.hours * 3600 : 1)

    // NPC行為系統更新（偵查和攻擊決策）——快轉時跳過，避免靜默觸發戰鬥與警報
    if (!silent) {
      updateNPCBehavior(1)
    }

    // 檢查成就解鎖（快轉時跳過，避免逐條 toast 轟炸；下個正常 tick 會補上）
    if (!silent) {
      checkAchievementUnlocks()
    }

    // 檢查戰役任務進度
    if (gameStore.player.campaignProgress) {
      campaignLogic.checkAllActiveQuestsProgress(gameStore.player, npcStore.npcs)
    }

    // 檢查並處理被消滅的NPC（所有星球都被摧毀的NPC）
    const eliminatedNpcIds = diplomaticLogic.checkAndHandleEliminatedNPCs(npcStore.npcs, gameStore.player, gameStore.locale)
    if (eliminatedNpcIds.length > 0) {
      // 從universeStore中移除被消滅NPC的星球資料，並收集需要清理的任務ID
      const missionIdsToRemove: string[] = []
      eliminatedNpcIds.forEach(npcId => {
        const npc = npcStore.npcs.find(n => n.id === npcId)
        if (npc) {
          // 遍歷NPC的所有星球，從universeStore中刪除
          if (npc.planets) {
            npc.planets.forEach(planet => {
              const planetKey = gameLogic.generatePositionKey(planet.position.galaxy, planet.position.system, planet.position.position)
              if (universeStore.planets[planetKey]) {
                delete universeStore.planets[planetKey]
              }
            })
          }
          // 收集該NPC所有任務的ID（用於清理玩家的警報）
          if (npc.fleetMissions) {
            npc.fleetMissions.forEach(m => missionIdsToRemove.push(m.id))
          }
        }
      })

      // 清理玩家的即將到來艦隊警報（移除已消滅NPC的任務警報）
      if (gameStore.player.incomingFleetAlerts && missionIdsToRemove.length > 0) {
        gameStore.player.incomingFleetAlerts = gameStore.player.incomingFleetAlerts.filter(alert => !missionIdsToRemove.includes(alert.id))
      }

      // 從NPC列表中移除被消滅的NPC
      npcStore.npcs = npcStore.npcs.filter(npc => !eliminatedNpcIds.includes(npc.id))
    }

    // 靜默模式：一份彙總 toast 替代逐條通知
    if (silent) {
      const parts: string[] = []
      if (skipStats.buildings > 0) parts.push(t('overview.timeSkipBuilding', { count: skipStats.buildings }))
      if (skipStats.researches > 0) parts.push(t('overview.timeSkipResearch', { count: skipStats.researches }))
      if (skipStats.ships > 0) parts.push(t('overview.timeSkipShip', { count: skipStats.ships }))
      if (skipStats.defenses > 0) parts.push(t('overview.timeSkipDefense', { count: skipStats.defenses }))
      if (skipStats.unlocks > 0) parts.push(t('overview.timeSkipUnlock', { count: skipStats.unlocks }))
      parts.push(...autopilotSummary)
      const details = parts.length > 0 ? parts.join('、') : t('overview.timeSkipNothing')
      toast.success(t('overview.timeSkipSummary', { hours: opts?.hours ?? 0, details }))
    }
  }

  const updateGame = async () => {
    // BLK-1：遊戲時間 = Date.now() + timeOffset（虛擬時間），隨真實時間持續推進；
    // 快轉只增加 timeOffset，不再把 gameTime 凍在未來。
    await updateGameAt(getGameNow())
  }

  // 一鍵時間快轉：立即結算未來 N 小時的遊戲狀態
  // BLK-1：只增加 timeOffset（持久化），後續每秒 tick 用 getGameNow() 繼續推進，
  // 不會凍結、不會倒退、不會重複結算；
  // 存檔由 pinia-plugin-persistedstate 在狀態變更時自動持久化到 localStorage，UI 透過 Vue 響應式自動重新整理
  const timeSkip = async (hours: number) => {
    if (gameStore.isPaused) {
      toast.info(t('settings.gamePaused'))
      return
    }
    gameStore.timeOffset = (gameStore.timeOffset || 0) + hours * 3600 * 1000
    setTimeOffset(gameStore.timeOffset)
    await updateGameAt(getGameNow(), { silent: true, hours })
  }

  // 處理時間快轉事件（總覽頁按鈕派發）
  const handleTimeSkipEvent = (event: CustomEvent) => {
    const hours = event.detail?.hours
    if (typeof hours === 'number' && hours > 0) {
      void timeSkip(hours)
    }
  }

  const processMissionArrival = async (mission: FleetMission, now: number = getGameNow()) => {
    // 從宇宙星球地圖中查詢目標星球
    const targetKey = gameLogic.generatePositionKey(
      mission.targetPosition.galaxy,
      mission.targetPosition.system,
      mission.targetPosition.position
    )
    // 先從玩家星球中查詢，再從宇宙地圖中查詢
    // 如果任務指定了targetIsMoon，需要精確匹配行星或月球
    const targetPlanet =
      gameStore.player.planets.find(p => {
        const positionMatch =
          p.position.galaxy === mission.targetPosition.galaxy &&
          p.position.system === mission.targetPosition.system &&
          p.position.position === mission.targetPosition.position
        // 如果任務明確指定目標型別，按型別匹配
        if (mission.targetIsMoon !== undefined) {
          return positionMatch && p.isMoon === mission.targetIsMoon
        }
        // 相容舊任務：預設優先匹配行星（非月球）
        return positionMatch && !p.isMoon
      }) ||
      // 如果沒有匹配到指定型別，嘗試匹配同位置的任何星球
      gameStore.player.planets.find(
        p =>
          p.position.galaxy === mission.targetPosition.galaxy &&
          p.position.system === mission.targetPosition.system &&
          p.position.position === mission.targetPosition.position
      ) ||
      universeStore.planets[targetKey]

    // 獲取起始星球名稱（用於報告）
    const originPlanet = gameStore.player.planets.find(p => p.id === mission.originPlanetId)
    const originPlanetName = originPlanet?.name || t('fleetView.unknownPlanet')

    if (mission.missionType === MissionType.Transport) {
      // 在處理任務之前儲存貨物資訊（因為processTransportArrival會清空cargo）
      const transportedResources = { ...mission.cargo }
      const isGiftMission = mission.isGift && mission.giftTargetNpcId
      const bonuses = officerLogic.calculateActiveBonuses(gameStore.player.officers, now)
      const result = fleetLogic.processTransportArrival(
        mission, targetPlanet, gameStore.player, npcStore.npcs, gameStore.locale, bonuses.storageCapacityBonus
      )

      // 更新成就統計（僅在成功時追蹤）
      if (result.success) {
        const totalTransported =
          transportedResources.metal + transportedResources.crystal + transportedResources.deuterium + transportedResources.darkMatter
        if (isGiftMission) {
          // 送禮成功
          gameLogic.trackDiplomacyStats(gameStore.player, 'gift', { resourcesAmount: totalTransported })
        } else {
          // 普通運輸任務成功
          gameLogic.trackMissionStats(gameStore.player, 'transport', { resourcesAmount: totalTransported })
        }
      }

      // 生成失敗原因訊息
      let transportFailMessage = t('missionReports.transportFailed')
      if (!result.success && result.failReason) {
        if (result.failReason === 'targetNotFound') {
          transportFailMessage = t('missionReports.transportFailedTargetNotFound')
        } else if (result.failReason === 'giftRejected') {
          transportFailMessage = t('missionReports.transportFailedGiftRejected')
        }
      }

      // 生成運輸任務報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }
      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Transport,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        targetPlanetId: targetPlanet?.id,
        targetPlanetName:
          targetPlanet?.name || `[${mission.targetPosition.galaxy}:${mission.targetPosition.system}:${mission.targetPosition.position}]`,
        success: result.success,
        message: result.success ? t('missionReports.transportSuccess') : transportFailMessage,
        details: {
          transportedResources,
          failReason: result.failReason
        },
        read: false
      })
    } else if (mission.missionType === MissionType.Attack) {
      const attackResult = await fleetLogic.processAttackArrival(mission, targetPlanet, gameStore.player, null, gameStore.player.planets)
      if (attackResult) {
        gameStore.player.battleReports.push(attackResult.battleResult)

        // 更新成就統計 - 攻擊
        const debrisValue = attackResult.debrisField
          ? attackResult.debrisField.resources.metal + attackResult.debrisField.resources.crystal
          : 0
        const won = attackResult.battleResult.winner === 'attacker'
        gameLogic.trackAttackStats(gameStore.player, attackResult.battleResult, won, debrisValue)

        // 檢查是否攻擊了NPC星球，更新外交關係
        if (targetPlanet) {
          const targetNpc = npcStore.npcs.find(npc => npc.planets.some(p => p.id === targetPlanet.id))
          if (targetNpc) {
            diplomaticLogic.handleAttackReputation(gameStore.player, targetNpc, attackResult.battleResult, npcStore.npcs, gameStore.locale)

            // 同步戰鬥損失到NPC的實際星球資料
            const npcPlanet = targetNpc.planets.find(p => p.id === targetPlanet.id)
            if (npcPlanet) {
              // 同步艦隊損失
              Object.entries(attackResult.battleResult.defenderLosses.fleet).forEach(([shipType, lost]) => {
                npcPlanet.fleet[shipType as ShipType] = Math.max(0, (npcPlanet.fleet[shipType as ShipType] || 0) - lost)
              })
              // 同步防禦損失（修復後的資料已在targetPlanet中）
              npcPlanet.defense = { ...targetPlanet.defense }
              // 同步資源（被掠奪後的）
              npcPlanet.resources = { ...targetPlanet.resources }
            }
          }
        }

        if (attackResult.moon) {
          gameStore.player.planets.push(attackResult.moon)
        }
        if (attackResult.debrisField) {
          // 將殘骸場新增到遊戲狀態
          universeStore.debrisFields[attackResult.debrisField.id] = attackResult.debrisField
        }
      }
    } else if (mission.missionType === MissionType.Colonize) {
      const colonizeResult = fleetLogic.processColonizeArrival(mission, targetPlanet, gameStore.player, t('planet.colonyPrefix'))
      const newPlanet = colonizeResult.planet

      // 更新成就統計 - 殖民
      if (colonizeResult.success && newPlanet) {
        gameLogic.trackMissionStats(gameStore.player, 'colonize')
      }

      // 生成失敗原因訊息
      let failMessage = t('missionReports.colonizeFailed')
      if (!colonizeResult.success && colonizeResult.failReason) {
        if (colonizeResult.failReason === 'positionOccupied') {
          failMessage = t('missionReports.colonizeFailedOccupied')
        } else if (colonizeResult.failReason === 'maxColoniesReached') {
          failMessage = t('missionReports.colonizeFailedMaxColonies')
        }
      }

      // 生成殖民任務報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }
      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Colonize,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        targetPlanetId: newPlanet?.id,
        targetPlanetName: newPlanet?.name,
        success: colonizeResult.success,
        message: colonizeResult.success ? t('missionReports.colonizeSuccess') : failMessage,
        details: newPlanet
          ? {
              newPlanetId: newPlanet.id,
              newPlanetName: newPlanet.name
            }
          : { failReason: colonizeResult.failReason },
        read: false
      })
      if (newPlanet) {
        gameStore.player.planets.push(newPlanet)
      }
    } else if (mission.missionType === MissionType.Spy) {
      const spyResult = fleetLogic.processSpyArrival(mission, targetPlanet, gameStore.player, null, npcStore.npcs)
      if (spyResult.success && spyResult.report) {
        gameStore.player.spyReports.push(spyResult.report)
        // 更新成就統計 - 偵查
        gameLogic.trackMissionStats(gameStore.player, 'spy')
      }

      // 生成偵查任務報告（即使失敗也生成）
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }

      let spyFailMessage = t('missionReports.spyFailed')
      if (!spyResult.success && spyResult.failReason) {
        if (spyResult.failReason === 'targetNotFound') {
          spyFailMessage = t('missionReports.spyFailedTargetNotFound')
        }
      }

      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Spy,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        targetPlanetId: targetPlanet?.id,
        targetPlanetName:
          targetPlanet?.name || `[${mission.targetPosition.galaxy}:${mission.targetPosition.system}:${mission.targetPosition.position}]`,
        success: spyResult.success,
        message: spyResult.success ? t('missionReports.spySuccess') : spyFailMessage,
        details: spyResult.success ? { spyReportId: spyResult.report?.id } : { failReason: spyResult.failReason },
        read: false
      })
    } else if (mission.missionType === MissionType.Deploy) {
      const deployed = fleetLogic.processDeployArrival(mission, targetPlanet, gameStore.player.id, gameStore.player.technologies)

      // 更新成就統計 - 部署
      if (deployed.success) {
        gameLogic.trackMissionStats(gameStore.player, 'deploy')
      }

      // 生成失敗原因訊息
      let deployFailMessage = t('missionReports.deployFailed')
      if (!deployed.success && deployed.failReason) {
        if (deployed.failReason === 'targetNotFound') {
          deployFailMessage = t('missionReports.deployFailedTargetNotFound')
        } else if (deployed.failReason === 'notOwnPlanet') {
          deployFailMessage = t('missionReports.deployFailedNotOwnPlanet')
        }
      }

      // 生成部署任務報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }
      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Deploy,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        targetPlanetId: targetPlanet?.id,
        targetPlanetName:
          targetPlanet?.name || `[${mission.targetPosition.galaxy}:${mission.targetPosition.system}:${mission.targetPosition.position}]`,
        success: deployed.success,
        message: deployed.success ? t('missionReports.deploySuccess') : deployFailMessage,
        details: {
          deployedFleet: mission.fleet,
          failReason: deployed.failReason
        },
        read: false
      })
      if (deployed.success && !deployed.overflow) {
        const missionIndex = gameStore.player.fleetMissions.indexOf(mission)
        if (missionIndex > -1) gameStore.player.fleetMissions.splice(missionIndex, 1)
        return
      }
    } else if (mission.missionType === MissionType.Recycle) {
      // 處理回收任務
      const debrisId = `debris_${mission.targetPosition.galaxy}_${mission.targetPosition.system}_${mission.targetPosition.position}`
      const debrisField = universeStore.debrisFields[debrisId]
      const recycleResult = fleetLogic.processRecycleArrival(mission, debrisField)

      // 更新成就統計 - 回收（無論是否有殘骸都算飛行任務，但只有成功回收才計入回收資源量）
      const totalRecycled =
        recycleResult.success && recycleResult.collectedResources
          ? recycleResult.collectedResources.metal + recycleResult.collectedResources.crystal
          : 0
      gameLogic.trackMissionStats(gameStore.player, 'recycle', { resourcesAmount: totalRecycled })

      // 生成失敗原因訊息
      let recycleFailMessage = t('missionReports.recycleFailed')
      if (!recycleResult.success && recycleResult.failReason) {
        if (recycleResult.failReason === 'noDebrisField') {
          recycleFailMessage = t('missionReports.recycleFailedNoDebris')
        } else if (recycleResult.failReason === 'debrisEmpty') {
          recycleFailMessage = t('missionReports.recycleFailedDebrisEmpty')
        }
      }

      // 生成回收任務報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }
      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Recycle,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        success: recycleResult.success,
        message: recycleResult.success ? t('missionReports.recycleSuccess') : recycleFailMessage,
        details: recycleResult.success
          ? {
              recycledResources: recycleResult.collectedResources,
              remainingDebris: recycleResult.remainingDebris || undefined
            }
          : { failReason: recycleResult.failReason },
        read: false
      })

      if (recycleResult.success && recycleResult.collectedResources && debrisField) {
        if (recycleResult.remainingDebris && (recycleResult.remainingDebris.metal > 0 || recycleResult.remainingDebris.crystal > 0)) {
          // 更新殘骸場
          universeStore.debrisFields[debrisId] = {
            id: debrisField.id,
            position: debrisField.position,
            resources: recycleResult.remainingDebris,
            createdAt: debrisField.createdAt,
            expiresAt: debrisField.expiresAt
          }
        } else {
          // 殘骸場已被完全收集，刪除
          delete universeStore.debrisFields[debrisId]
        }
      }
    } else if (mission.missionType === MissionType.Destroy) {
      // 處理行星毀滅任務（需要先戰鬥，再計算毀滅機率）
      const destroyResult = await fleetLogic.processDestroyArrival(mission, targetPlanet, gameStore.player, null, gameStore.player.planets)

      // 處理戰鬥報告（如果發生了戰鬥）
      if (destroyResult.battleResult) {
        gameStore.player.battleReports.push(destroyResult.battleResult)

        // 處理戰鬥對NPC的影響
        if (targetPlanet) {
          const targetNpc = npcStore.npcs.find(npc => npc.planets.some(p => p.id === targetPlanet.id))
          if (targetNpc) {
            diplomaticLogic.handleAttackReputation(gameStore.player, targetNpc, destroyResult.battleResult, npcStore.npcs, gameStore.locale)

            // 同步戰鬥損失到NPC的實際星球資料
            const npcPlanet = targetNpc.planets.find(p => p.id === targetPlanet.id)
            if (npcPlanet) {
              Object.entries(destroyResult.battleResult.defenderLosses.fleet).forEach(([shipType, lost]) => {
                npcPlanet.fleet[shipType as ShipType] = Math.max(0, (npcPlanet.fleet[shipType as ShipType] || 0) - lost)
              })
              npcPlanet.defense = { ...targetPlanet.defense }
              npcPlanet.resources = { ...targetPlanet.resources }
            }
          }
        }
      }

      // 處理新生成的月球
      if (destroyResult.moon) {
        gameStore.player.planets.push(destroyResult.moon)
      }

      // 處理殘骸場
      if (destroyResult.debrisField) {
        universeStore.debrisFields[destroyResult.debrisField.id] = destroyResult.debrisField
      }

      // 更新成就統計 - 行星毀滅
      if (destroyResult.success) {
        gameLogic.trackMissionStats(gameStore.player, 'destroy')
      }

      // 生成失敗原因訊息
      let destroyFailMessage = t('missionReports.destroyFailed')
      if (!destroyResult.success && destroyResult.failReason) {
        if (destroyResult.failReason === 'targetNotFound') {
          destroyFailMessage = t('missionReports.destroyFailedTargetNotFound')
        } else if (destroyResult.failReason === 'ownPlanet') {
          destroyFailMessage = t('missionReports.destroyFailedOwnPlanet')
        } else if (destroyResult.failReason === 'noDeathstar') {
          destroyFailMessage = t('missionReports.destroyFailedNoDeathstar')
        } else if (destroyResult.failReason === 'chanceFailed') {
          destroyFailMessage = t('missionReports.destroyFailedChance', { chance: destroyResult.destructionChance.toFixed(1) })
        }
      }

      // 生成毀滅任務報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }
      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Destroy,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        targetPlanetId: targetPlanet?.id,
        targetPlanetName: targetPlanet?.name,
        success: destroyResult.success,
        message: destroyResult.success ? t('missionReports.destroySuccess') : destroyFailMessage,
        details: destroyResult.success
          ? {
              destroyedPlanetName:
                targetPlanet?.name ||
                `[${mission.targetPosition.galaxy}:${mission.targetPosition.system}:${mission.targetPosition.position}]`,
              hadBattle: !!destroyResult.battleResult
            }
          : {
              failReason: destroyResult.failReason,
              destructionChance: destroyResult.destructionChance,
              deathstarsLost: destroyResult.deathstarsLost,
              hadBattle: !!destroyResult.battleResult
            },
        read: false
      })

      if (destroyResult.success && destroyResult.planetId) {
        // 星球被摧毀

        // 處理外交關係（如果目標是NPC星球）
        if (targetPlanet && targetPlanet.ownerId) {
          const planetOwner = npcStore.npcs.find(npc => npc.id === targetPlanet.ownerId)
          if (planetOwner) {
            diplomaticLogic.handlePlanetDestructionReputation(gameStore.player, targetPlanet, planetOwner, npcStore.npcs, gameStore.locale)

            // 從NPC的星球列表中移除被摧毀的星球
            const npcPlanetIndex = planetOwner.planets.findIndex(p => p.id === destroyResult.planetId)
            if (npcPlanetIndex > -1) {
              planetOwner.planets.splice(npcPlanetIndex, 1)
            }

            // 檢查並處理被消滅的NPC（所有星球都被摧毀的NPC）
            const eliminatedNpcIds = diplomaticLogic.checkAndHandleEliminatedNPCs(npcStore.npcs, gameStore.player, gameStore.locale)

            // 從npcStore中移除被消滅的NPC
            if (eliminatedNpcIds.length > 0) {
              npcStore.npcs = npcStore.npcs.filter(npc => !eliminatedNpcIds.includes(npc.id))
            }
          }
        }

        // 從玩家星球列表中移除（如果是玩家的星球）
        const planetIndex = gameStore.player.planets.findIndex(p => p.id === destroyResult.planetId)
        if (planetIndex > -1) {
          gameStore.player.planets.splice(planetIndex, 1)
        } else {
          // 不是玩家星球，從宇宙地圖中移除
          delete universeStore.planets[targetKey]
        }

        // 取消所有前往該位置的NPC任務（回收、攻擊、偵查等）
        const destroyedDebrisId = `debris_${mission.targetPosition.galaxy}_${mission.targetPosition.system}_${mission.targetPosition.position}`
        npcStore.npcs.forEach(npc => {
          if (npc.fleetMissions) {
            // 找到需要取消的任務（前往已摧毀星球位置的outbound任務）
            const missionsToCancel = npc.fleetMissions.filter(m => {
              if (m.status !== 'outbound') return false
              // 檢查回收任務的殘骸場ID
              if (m.missionType === MissionType.Recycle && m.debrisFieldId === destroyedDebrisId) {
                return true
              }
              // 檢查其他任務的目標星球ID
              if (m.targetPlanetId === destroyResult.planetId) {
                return true
              }
              return false
            })

            // 將這些任務的艦隊返回給NPC
            missionsToCancel.forEach(m => {
              const npcOriginPlanet = npc.planets.find(p => p.id === m.originPlanetId)
              if (npcOriginPlanet) {
                shipLogic.addFleet(npcOriginPlanet.fleet, m.fleet)
              }
            })

            // 從任務列表中移除這些任務
            npc.fleetMissions = npc.fleetMissions.filter(m => !missionsToCancel.includes(m))
          }

          // 清理關於被摧毀星球的偵查報告
          if (npc.playerSpyReports && destroyResult.planetId && destroyResult.planetId in npc.playerSpyReports) {
            delete npc.playerSpyReports[destroyResult.planetId]
          }
        })

        // 同時刪除該位置的殘骸場（星球被摧毀後殘骸場也消失）
        delete universeStore.debrisFields[destroyedDebrisId]
      }
    } else if (mission.missionType === MissionType.Expedition) {
      // 處理探險任務
      const expeditionResult = fleetLogic.processExpeditionArrival(mission)

      // 確保返回時間正確設定（相容舊版本任務資料）
      // 如果 returnTime 不存在或已過期，重新計算
      if (!mission.returnTime || mission.returnTime <= now) {
        // 返回時間應該等於當前時間加上單程飛行時間
        const flightDuration = mission.arrivalTime - mission.departureTime
        mission.returnTime = now + flightDuration
      }

      // 更新成就統計 - 探險
      const isSuccessful =
        expeditionResult.eventType === 'resources' || expeditionResult.eventType === 'darkMatter' || expeditionResult.eventType === 'fleet'
      gameLogic.trackMissionStats(gameStore.player, 'expedition', { successful: isSuccessful })

      // 生成探險任務報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }

      // 根據事件型別生成不同的報告訊息
      let reportMessage = ''
      let reportDetails: Record<string, unknown> = {
        // 儲存探險區域資訊
        expeditionZone: mission.expeditionZone
      }

      switch (expeditionResult.eventType) {
        case 'resources':
          reportMessage = t('missionReports.expeditionResources')
          reportDetails.foundResources = expeditionResult.resources
          break
        case 'darkMatter':
          reportMessage = t('missionReports.expeditionDarkMatter')
          reportDetails.foundResources = expeditionResult.resources
          break
        case 'fleet':
          reportMessage = t('missionReports.expeditionFleet')
          reportDetails.foundFleet = expeditionResult.fleet
          break
        case 'pirates':
          reportMessage = expeditionResult.fleetLost
            ? t('missionReports.expeditionPiratesAttack')
            : t('missionReports.expeditionPiratesEscaped')
          if (expeditionResult.fleetLost) reportDetails.fleetLost = expeditionResult.fleetLost
          break
        case 'aliens':
          reportMessage = expeditionResult.fleetLost
            ? t('missionReports.expeditionAliensAttack')
            : t('missionReports.expeditionAliensEscaped')
          if (expeditionResult.fleetLost) reportDetails.fleetLost = expeditionResult.fleetLost
          break
        default:
          reportMessage = t('missionReports.expeditionNothing')
      }

      gameStore.player.missionReports.push({
        id: `mission-report-${mission.id}`,
        timestamp: now,
        missionType: MissionType.Expedition,
        originPlanetId: mission.originPlanetId,
        originPlanetName,
        targetPosition: mission.targetPosition,
        success: expeditionResult.eventType !== 'nothing',
        message: reportMessage,
        details: reportDetails,
        read: false
      })
    }

    // 更新任務狀態為返回中
    // Deploy任務不需要返回（艦隊已經留在目標星球）
    if (mission.missionType !== MissionType.Deploy) {
      mission.status = 'returning'
      // 確保returnTime已設定（如果還沒設定的話）
      if (!mission.returnTime) {
        const flightTime = mission.arrivalTime - mission.departureTime
        mission.returnTime = now + flightTime
      }
    }
  }

  const processMissionReturn = (mission: FleetMission) => {
    const originPlanet = gameStore.player.planets.find(p => p.id === mission.originPlanetId)
    if (!originPlanet) return
    shipLogic.addFleet(originPlanet.fleet, mission.fleet)
    resourceLogic.addResources(originPlanet.resources, mission.cargo)
    const missionIndex = gameStore.player.fleetMissions.indexOf(mission)
    if (missionIndex > -1) gameStore.player.fleetMissions.splice(missionIndex, 1)
  }

  // NPC任務處理
  const processNPCMissionArrival = (npc: NPC, mission: FleetMission, now: number = getGameNow()) => {
    if (mission.missionType === MissionType.Recycle) {
      // NPC回收任務到達
      const debrisId = mission.debrisFieldId
      if (!debrisId) {
        console.warn('[NPC Mission] Recycle mission missing debrisFieldId')
        mission.status = 'returning'
        mission.returnTime = now + (mission.arrivalTime - mission.departureTime)
        return
      }

      const debrisField = universeStore.debrisFields[debrisId]
      const recycleResult = fleetLogic.processRecycleArrival(mission, debrisField)

      if (recycleResult && debrisField && recycleResult.collectedResources) {
        // 更新成就統計 - 被NPC回收殘骸（如果殘骸是玩家戰鬥產生的）
        const totalRecycled = recycleResult.collectedResources.metal + recycleResult.collectedResources.crystal
        if (totalRecycled > 0) {
          gameLogic.trackDiplomacyStats(gameStore.player, 'debrisRecycledByNPC', { resourcesAmount: totalRecycled })
        }

        if (recycleResult.remainingDebris && (recycleResult.remainingDebris.metal > 0 || recycleResult.remainingDebris.crystal > 0)) {
          // 更新殘骸場
          universeStore.debrisFields[debrisId] = {
            id: debrisField.id,
            position: debrisField.position,
            resources: recycleResult.remainingDebris,
            createdAt: debrisField.createdAt
          }
        } else {
          // 殘骸已被完全回收，從宇宙中刪除
          delete universeStore.debrisFields[debrisId]
        }
      }

      // 移除即將到來的警告（回收任務已到達）
      removeIncomingFleetAlertById(mission.id)

      // 設定返回時間
      mission.returnTime = now + (mission.arrivalTime - mission.departureTime)
      return
    }

    // 找到目標星球
    const targetKey = gameLogic.generatePositionKey(
      mission.targetPosition.galaxy,
      mission.targetPosition.system,
      mission.targetPosition.position
    )
    const targetPlanet =
      gameStore.player.planets.find(
        p =>
          p.position.galaxy === mission.targetPosition.galaxy &&
          p.position.system === mission.targetPosition.system &&
          p.position.position === mission.targetPosition.position
      ) || universeStore.planets[targetKey]

    if (!targetPlanet) {
      console.warn('[NPC Mission] Target planet not found')
      return
    }

    if (mission.missionType === MissionType.Spy) {
      // NPC偵查到達
      const { spiedNotification, spyReport } = npcBehaviorLogic.processNPCSpyArrival(npc, mission, targetPlanet, gameStore.player)

      // 更新成就統計 - 被NPC偵查
      gameLogic.trackDiplomacyStats(gameStore.player, 'spiedByNPC')

      // 儲存偵查報告到NPC（用於後續攻擊決策）
      if (!npc.playerSpyReports) {
        npc.playerSpyReports = {}
      }
      npc.playerSpyReports[targetPlanet.id] = spyReport

      // 新增被偵查通知給玩家
      if (!gameStore.player.spiedNotifications) {
        gameStore.player.spiedNotifications = []
      }
      gameStore.player.spiedNotifications.push(spiedNotification)

      // 移除即將到來的警告（偵查已到達）
      removeIncomingFleetAlertById(mission.id)
    } else if (mission.missionType === MissionType.Attack) {
      // NPC攻擊到達 - 使用專門的NPC攻擊處理邏輯
      fleetLogic.processNPCAttackArrival(npc, mission, targetPlanet, gameStore.player, gameStore.player.planets).then(attackResult => {
        if (attackResult) {
          // 更新成就統計 - 被NPC攻擊 + 防禦統計
          gameLogic.trackDiplomacyStats(gameStore.player, 'attackedByNPC')
          const debrisValue = attackResult.debrisField
            ? attackResult.debrisField.resources.metal + attackResult.debrisField.resources.crystal
            : 0
          const won = attackResult.battleResult.winner === 'defender'
          gameLogic.trackDefenseStats(gameStore.player, attackResult.battleResult, won, debrisValue)

          // 新增戰鬥報告給玩家
          gameStore.player.battleReports.push(attackResult.battleResult)

          // 如果生成月球，新增到玩家星球列表
          if (attackResult.moon) {
            gameStore.player.planets.push(attackResult.moon)
          }

          // 如果生成殘骸場，新增到宇宙殘骸場列表
          if (attackResult.debrisField) {
            const existingDebris = universeStore.debrisFields[attackResult.debrisField.id]
            if (existingDebris) {
              // 累加殘骸資源
              universeStore.debrisFields[attackResult.debrisField.id] = {
                ...existingDebris,
                resources: {
                  metal: existingDebris.resources.metal + attackResult.debrisField.resources.metal,
                  crystal: existingDebris.resources.crystal + attackResult.debrisField.resources.crystal
                }
              }
            } else {
              // 新殘骸場
              universeStore.debrisFields[attackResult.debrisField.id] = attackResult.debrisField
            }
          }
        }

        // 移除即將到來的警告（攻擊已到達）
        removeIncomingFleetAlertById(mission.id)
      })
    }
  }

  const processNPCMissionReturn = (npc: NPC, mission: FleetMission) => {
    // 找到NPC的起始星球
    const originPlanet = npc.planets.find(p => p.id === mission.originPlanetId)
    if (!originPlanet) return

    // 返還艦隊
    shipLogic.addFleet(originPlanet.fleet, mission.fleet)

    // 如果攜帶掠奪資源，給NPC新增資源
    if (mission.cargo) {
      originPlanet.resources.metal += mission.cargo.metal
      originPlanet.resources.crystal += mission.cargo.crystal
      originPlanet.resources.deuterium += mission.cargo.deuterium
    }

    // 從NPC任務列表中移除
    if (npc.fleetMissions) {
      const missionIndex = npc.fleetMissions.indexOf(mission)
      if (missionIndex > -1) {
        npc.fleetMissions.splice(missionIndex, 1)
      }
    }
  }

  // 處理導彈攻擊到達
  const processMissileAttackArrival = async (missileAttack: MissileAttack, now: number = getGameNow()) => {
    // 動態匯入導彈邏輯
    const missileLogic = await import('@/logic/missileLogic')

    // 找到目標星球
    const targetKey = gameLogic.generatePositionKey(
      missileAttack.targetPosition.galaxy,
      missileAttack.targetPosition.system,
      missileAttack.targetPosition.position
    )
    const targetPlanet =
      gameStore.player.planets.find(
        p =>
          p.position.galaxy === missileAttack.targetPosition.galaxy &&
          p.position.system === missileAttack.targetPosition.system &&
          p.position.position === missileAttack.targetPosition.position
      ) || universeStore.planets[targetKey]

    // 如果目標星球不存在，導彈失敗
    if (!targetPlanet) {
      missileAttack.status = 'arrived'
      // 生成失敗報告
      if (!gameStore.player.missionReports) {
        gameStore.player.missionReports = []
      }
      gameStore.player.missionReports.push({
        id: `missile-report-${missileAttack.id}`,
        timestamp: now,
        missionType: MissionType.MissileAttack,
        originPlanetId: missileAttack.originPlanetId,
        originPlanetName: gameStore.player.planets.find(p => p.id === missileAttack.originPlanetId)?.name || t('fleetView.unknownPlanet'),
        targetPosition: missileAttack.targetPosition,
        targetPlanetId: undefined,
        targetPlanetName: `[${missileAttack.targetPosition.galaxy}:${missileAttack.targetPosition.system}:${missileAttack.targetPosition.position}]`,
        success: false,
        message: t('missionReports.missileAttackFailed'),
        details: {
          missileCount: missileAttack.missileCount,
          missileHits: 0,
          missileIntercepted: 0,
          defenseLosses: {}
        },
        read: false
      })
      return
    }

    // 計算導彈攻擊結果
    const impactResult = missileLogic.calculateMissileImpact(missileAttack.missileCount, targetPlanet)

    // 應用損失到目標星球
    missileLogic.applyMissileAttackResult(targetPlanet, impactResult.defenseLosses)

    // 如果目標是NPC的星球，同步損失到NPC實際資料並扣除外交好感度
    if (targetPlanet.ownerId && targetPlanet.ownerId !== gameStore.player.id) {
      const targetNpc = npcStore.npcs.find(npc => npc.id === targetPlanet.ownerId)
      if (targetNpc) {
        // 同步防禦損失到NPC的實際星球資料
        const npcPlanet = targetNpc.planets.find(p => p.id === targetPlanet.id)
        if (npcPlanet) {
          missileLogic.applyMissileAttackResult(npcPlanet, impactResult.defenseLosses)
        }

        // 導彈攻擊扣除好感度
        const { REPUTATION_CHANGES } = DIPLOMATIC_CONFIG
        const reputationLoss = REPUTATION_CHANGES.ATTACK / 2 // 導彈攻擊的好感度懲罰是普通攻擊的一半

        // 更新NPC對玩家的關係（統一使用 npc.relations 作為唯一資料來源）
        if (!targetNpc.relations) {
          targetNpc.relations = {}
        }
        const npcRelation = diplomaticLogic.getOrCreateRelation(targetNpc.relations, targetNpc.id, gameStore.player.id)
        targetNpc.relations[gameStore.player.id] = diplomaticLogic.updateReputation(
          npcRelation,
          reputationLoss,
          DiplomaticEventType.Attack,
          t('diplomacy.reports.wasAttackedByMissile')
        )
      }
    }

    // 標記導彈攻擊為已到達
    missileAttack.status = 'arrived'

    // 生成導彈攻擊報告
    if (!gameStore.player.missionReports) {
      gameStore.player.missionReports = []
    }
    const reportMessage =
      impactResult.missileHits > 0
        ? `${t('missionReports.missileAttackSuccess')}: ${impactResult.missileHits} ${t('missionReports.hits')}`
        : t('missionReports.missileAttackIntercepted')

    gameStore.player.missionReports.push({
      id: `missile-report-${missileAttack.id}`,
      timestamp: now,
      missionType: MissionType.MissileAttack,
      originPlanetId: missileAttack.originPlanetId,
      originPlanetName: gameStore.player.planets.find(p => p.id === missileAttack.originPlanetId)?.name || t('fleetView.unknownPlanet'),
      targetPosition: missileAttack.targetPosition,
      targetPlanetId: targetPlanet.id,
      targetPlanetName: targetPlanet.name,
      success: true,
      message: reportMessage,
      details: {
        missileCount: missileAttack.missileCount,
        missileHits: impactResult.missileHits,
        missileIntercepted: impactResult.missileIntercepted,
        defenseLosses: impactResult.defenseLosses
      },
      read: false
    })
  }

  // 開啟敵方警報面板
  const openEnemyAlertPanel = () => {
    enemyAlertNotificationsRef.value?.open()
  }

  const removeIncomingFleetAlertById = (missionId: string) => {
    if (!gameStore.player.incomingFleetAlerts) return
    const index = gameStore.player.incomingFleetAlerts.findIndex(a => a.id === missionId)
    if (index > -1) {
      gameStore.player.incomingFleetAlerts.splice(index, 1)
    }
  }

  /**
   * 同步NPC星球資料到universeStore
   * 解決npcStore和universeStore資料不同步的問題
   */
  const syncNPCPlanetToUniverse = (npc: any) => {
    npc.planets.forEach((npcPlanet: any) => {
      const planetKey = gameLogic.generatePositionKey(npcPlanet.position.galaxy, npcPlanet.position.system, npcPlanet.position.position)
      const universePlanet = universeStore.planets[planetKey]
      if (universePlanet) {
        // 同步所有關鍵資料
        universePlanet.resources = { ...npcPlanet.resources }
        universePlanet.buildings = { ...npcPlanet.buildings }
        universePlanet.fleet = { ...npcPlanet.fleet }
        universePlanet.defense = { ...npcPlanet.defense }
      }
    })
  }

  const updateNPCGrowth = (deltaSeconds: number) => {
    // 累積時間
    npcUpdateCounter.value += deltaSeconds

    // 只在達到更新間隔時才執行
    if (npcUpdateCounter.value < NPC_UPDATE_INTERVAL) {
      return
    }

    // 獲取所有星球
    const allPlanets = Object.values(universeStore.planets)

    // 如果NPC store為空，從星球資料中初始化NPC
    if (npcStore.npcs.length === 0) {
      const npcMap = new Map<string, any>()

      allPlanets.forEach(planet => {
        // 跳過玩家的星球
        if (planet.ownerId === gameStore.player.id || !planet.ownerId) return

        // 這是NPC的星球
        if (!npcMap.has(planet.ownerId)) {
          // 為每個NPC設定隨機的初始冷卻時間，避免所有NPC同時行動
          const now = Date.now()
          const randomSpyOffset = Math.random() * 240 * 1000 // 0-4分鐘的隨機延遲
          const randomAttackOffset = Math.random() * 480 * 1000 // 0-8分鐘的隨機延遲

          // 初始化NPC與玩家的中立關係
          const initialRelations: Record<string, any> = {}
          initialRelations[gameStore.player.id] = {
            fromId: planet.ownerId,
            toId: gameStore.player.id,
            reputation: 0,
            status: 'neutral' as const,
            lastUpdated: now,
            history: []
          }

          npcMap.set(planet.ownerId, {
            id: planet.ownerId,
            name: generateNPCName(planet.ownerId, resolveNPCNameLocale(gameStore.npcNameLocale, gameStore.locale)),
            planets: [],
            technologies: {}, // 初始化空科技樹
            difficulty: 'medium' as const, // 預設中等難度
            relations: initialRelations, // 外交關係（預設與玩家中立）
            allies: [], // 盟友列表
            enemies: [], // 敵人列表
            lastSpyTime: now - randomSpyOffset, // 設定隨機的上次偵查時間
            lastAttackTime: now - randomAttackOffset, // 設定隨機的上次攻擊時間
            fleetMissions: [], // 艦隊任務
            playerSpyReports: {} // 對玩家的偵查報告
          })
        }

        npcMap.get(planet.ownerId)!.planets.push(planet)
      })

      // 儲存到store
      npcStore.npcs = Array.from(npcMap.values())

      // 如果有NPC，基於距離初始化NPC實力
      if (npcStore.npcs.length > 0) {
        // 獲取玩家母星（第一個非月球星球）
        const homeworld = gameStore.player.planets.find(p => !p.isMoon)

        if (homeworld) {
          npcStore.npcs.forEach(npc => {
            // 基於距離初始化NPC實力
            npcGrowthLogic.initializeNPCByDistance(npc, homeworld.position)
            // 同步NPC星球資料到universeStore
            syncNPCPlanetToUniverse(npc)
          })
        }

        // 初始化NPC之間的外交關係（盟友/敵人）
        npcGrowthLogic.initializeNPCDiplomacy(npcStore.npcs)
      }
    }

    // 確保所有NPC都有間諜探測器（修復舊版本儲存的資料）
    if (npcStore.npcs.length > 0) {
      npcGrowthLogic.ensureNPCSpyProbes(npcStore.npcs)
    }

    // 確保所有NPC都有AI型別（修復舊版本儲存的資料）
    if (npcStore.npcs.length > 0) {
      npcGrowthLogic.ensureAllNPCsAIType(npcStore.npcs)
    }

    // 確保所有NPC都與玩家建立了關係（修復舊版本儲存的資料）
    if (npcStore.npcs.length > 0) {
      const now = Date.now()
      // 獲取玩家母星（用於計算距離）
      const homeworld = gameStore.player.planets.find(p => !p.isMoon)

      npcStore.npcs.forEach(npc => {
        if (!npc.relations) {
          npc.relations = {}
        }
        // 如果NPC沒有與玩家的關係，建立中立關係
        if (!npc.relations[gameStore.player.id]) {
          npc.relations[gameStore.player.id] = {
            fromId: npc.id,
            toId: gameStore.player.id,
            reputation: 0,
            status: 'neutral' as const,
            lastUpdated: now,
            history: []
          }
        }

        // 遷移舊存檔：如果NPC沒有距離資料，計算並設定
        if (homeworld && npc.distanceToHomeworld === undefined) {
          const npcPlanet = npc.planets[0]
          if (npcPlanet) {
            npc.distanceToHomeworld = npcGrowthLogic.calculateDistanceToHomeworld(npcPlanet.position, homeworld.position)
            npc.difficultyLevel = npcGrowthLogic.calculateDifficultyLevel(npc.distanceToHomeworld)
            // 重新初始化NPC實力以匹配新的距離難度系統
            npcGrowthLogic.initializeNPCByDistance(npc, homeworld.position)
            // 同步NPC星球資料到universeStore
            syncNPCPlanetToUniverse(npc)
          }
        }
      })
    }

    // 如果沒有NPC，直接返回
    if (npcStore.npcs.length === 0) {
      npcUpdateCounter.value = 0
      return
    }

    // 獲取玩家母星用於距離計算
    const homeworldForGrowth = gameStore.player.planets.find(p => !p.isMoon)

    // 使用累積的時間更新每個NPC（基於距離的成長系統）
    npcStore.npcs.forEach(npc => {
      if (homeworldForGrowth) {
        npcGrowthLogic.updateNPCGrowthByDistance(npc, homeworldForGrowth.position, npcUpdateCounter.value, gameStore.gameSpeed)
        // 同步NPC星球資料到universeStore（確保偵查報告顯示正確資料）
        syncNPCPlanetToUniverse(npc)
      }
    })

    // 重置計數器
    npcUpdateCounter.value = 0
  }

  const updateNPCBehavior = (deltaSeconds: number) => {
    // 累積時間
    npcBehaviorCounter.value += deltaSeconds

    // 只在達到更新間隔時才執行
    if (npcBehaviorCounter.value < NPC_BEHAVIOR_INTERVAL) {
      return
    }

    // 如果沒有NPC，直接返回
    if (npcStore.npcs.length === 0) {
      npcBehaviorCounter.value = 0
      return
    }

    const now = Date.now()
    // 合併玩家星球和NPC星球到allPlanets（NPC需要能夠偵查和攻擊玩家星球）
    const allPlanets = [...gameStore.player.planets, ...Object.values(universeStore.planets)]

    // 計算當前所有正在進行的偵查和攻擊任務數量
    let activeSpyMissions = 0
    let activeAttackMissions = 0
    npcStore.npcs.forEach(npc => {
      if (npc.fleetMissions) {
        npc.fleetMissions.forEach(mission => {
          if (mission.status === 'outbound') {
            if (mission.missionType === 'spy') {
              activeSpyMissions++
            } else if (mission.missionType === 'attack') {
              activeAttackMissions++
            }
          }
        })
      }
    })

    // 獲取併發限制配置
    const config = npcBehaviorLogic.calculateDynamicBehavior(gameStore.player.points)

    // 更新每個NPC的行為（隨機順序，避免總是優先處理同一批NPC）
    const shuffledNpcs = [...npcStore.npcs].sort(() => Math.random() - 0.5)
    shuffledNpcs.forEach(npc => {
      // 在更新前檢查當前併發數，如果已達上限則跳過該NPC
      npcBehaviorLogic.updateNPCBehaviorWithLimit(npc, gameStore.player, allPlanets, universeStore.debrisFields, now, {
        activeSpyMissions,
        activeAttackMissions,
        config
      })

      // 重新計算當前併發數（因為可能新增了任務）
      activeSpyMissions = 0
      activeAttackMissions = 0
      npcStore.npcs.forEach(n => {
        if (n.fleetMissions) {
          n.fleetMissions.forEach(mission => {
            if (mission.status === 'outbound') {
              if (mission.missionType === 'spy') activeSpyMissions++
              else if (mission.missionType === 'attack') activeAttackMissions++
            }
          })
        }
      })

      // 處理增強NPC行為（中立和友好NPC的特殊行為）
      const relation = npc.relations?.[gameStore.player.id]
      if (relation?.status === 'neutral') {
        const neutralResult = npcBehaviorLogic.updateNeutralNPCBehavior(npc, npcStore.npcs, gameStore.player, now)

        // 處理貿易提議
        if (neutralResult.tradeOffer) {
          if (!gameStore.player.tradeOffers) {
            gameStore.player.tradeOffers = []
          }
          gameStore.player.tradeOffers.push(neutralResult.tradeOffer)
          toast.info(t('npcBehavior.tradeOfferReceived'), {
            description: t('npcBehavior.tradeOfferDesc', { npcName: neutralResult.tradeOffer.npcName })
          })
        }

        // 處理態度搖擺
        if (neutralResult.swingDirection) {
          if (!gameStore.player.attitudeChangeNotifications) {
            gameStore.player.attitudeChangeNotifications = []
          }
          gameStore.player.attitudeChangeNotifications.push({
            id: `attitude_${Date.now()}_${npc.id}`,
            timestamp: now,
            npcId: npc.id,
            npcName: npc.name,
            previousStatus: 'neutral',
            newStatus: neutralResult.swingDirection,
            reason: 'attitude_swing',
            read: false
          })
          const statusKey = neutralResult.swingDirection === 'friendly' ? 'npcBehavior.becameFriendly' : 'npcBehavior.becameHostile'
          toast.info(t('npcBehavior.attitudeChanged'), {
            description: t(statusKey, { npcName: npc.name })
          })
        }
      } else if (relation?.status === 'friendly') {
        const friendlyResult = npcBehaviorLogic.updateFriendlyNPCBehavior(npc, npcStore.npcs, gameStore.player, now)

        // 處理情報報告
        if (friendlyResult.intelReport) {
          if (!gameStore.player.intelReports) {
            gameStore.player.intelReports = []
          }
          gameStore.player.intelReports.push(friendlyResult.intelReport)
          toast.info(t('npcBehavior.intelReceived'), {
            description: t('npcBehavior.intelReceivedDesc', { npcName: friendlyResult.intelReport.fromNpcName })
          })
        }

        // 處理聯合攻擊邀請
        if (friendlyResult.jointAttackInvite) {
          if (!gameStore.player.jointAttackInvites) {
            gameStore.player.jointAttackInvites = []
          }
          gameStore.player.jointAttackInvites.push(friendlyResult.jointAttackInvite)
          toast.info(t('npcBehavior.jointAttackInvite'), {
            description: t('npcBehavior.jointAttackInviteDesc', { npcName: friendlyResult.jointAttackInvite.fromNpcName })
          })
        }

        // 處理資源援助
        if (friendlyResult.aidProvided) {
          if (!gameStore.player.aidNotifications) {
            gameStore.player.aidNotifications = []
          }
          gameStore.player.aidNotifications.push({
            id: `aid_${Date.now()}_${npc.id}`,
            timestamp: now,
            npcId: npc.id,
            npcName: npc.name,
            aidResources: friendlyResult.aidProvided,
            read: false
          })
          const totalAid = friendlyResult.aidProvided.metal + friendlyResult.aidProvided.crystal + friendlyResult.aidProvided.deuterium
          toast.success(t('npcBehavior.aidReceived'), {
            description: t('npcBehavior.aidReceivedDesc', { npcName: npc.name, amount: totalAid.toLocaleString() })
          })
        }
      }
    })

    npcBehaviorCounter.value = 0
  }

  // 更新NPC關係統計（友好/敵對數量）
  const updateNPCRelationStats = () => {
    let friendlyCount = 0
    let hostileCount = 0
    const playerId = gameStore.player.id
    npcStore.npcs.forEach(npc => {
      const relation = npc.relations?.[playerId]
      if (relation) {
        const status = diplomaticLogic.calculateRelationStatus(relation.reputation)
        if (status === 'friendly') {
          friendlyCount++
        } else if (status === 'hostile') {
          hostileCount++
        }
      }
    })
    gameLogic.trackDiplomacyStats(gameStore.player, 'updateRelations', { friendlyCount, hostileCount })
  }

  // 檢查成就解鎖
  const achievementCheckCounter = ref(0)
  const ACHIEVEMENT_CHECK_INTERVAL = 5 // 每5秒檢查一次成就

  const checkAchievementUnlocks = () => {
    achievementCheckCounter.value += 1

    // 只在達到更新間隔時才執行
    if (achievementCheckCounter.value < ACHIEVEMENT_CHECK_INTERVAL) {
      return
    }

    // 更新NPC關係統計
    updateNPCRelationStats()

    // 檢查並解鎖成就
    const unlocks = gameLogic.checkAndUnlockAchievements(gameStore.player)

    // 顯示成就解鎖通知（獎勵已在 checkAndUnlockAchievements 中應用）
    unlocks.forEach(unlock => {
      // 顯示 toast 通知
      const tierName = t(`achievements.tiers.${unlock.tier}`)
      const achievementName = t(`achievements.names.${unlock.id}`)
      toast.success(t('achievements.unlocked'), {
        description: `${achievementName} (${tierName})`
      })
    })

    achievementCheckCounter.value = 0
  }

  // 啟動遊戲迴圈
  const startGameLoop = () => {
    if (gameStore.isPaused) return
    // 清理舊的定時器
    if (gameLoop.value) {
      clearInterval(gameLoop.value)
    }
    // 遊戲迴圈固定為1秒，避免高倍速時的卡頓
    // gameSpeed 只作用於資源產出和時間消耗的倍率
    const interval = 1000
    // 啟動新的遊戲迴圈
    gameLoop.value = setInterval(() => {
      updateGame()
    }, interval)
  }

  // 停止遊戲迴圈
  const stopGameLoop = () => {
    if (gameLoop.value) {
      clearInterval(gameLoop.value)
      gameLoop.value = null
    }
  }

  // 啟動積分更新定時器（每10秒更新一次）
  const startPointsUpdate = () => {
    if (pointsUpdateInterval.value) {
      clearInterval(pointsUpdateInterval.value)
    }
    pointsUpdateInterval.value = setInterval(() => {
      if (!gameStore.isPaused) {
        gameStore.player.points = publicLogic.calculatePlayerPoints(gameStore.player)
      }
    }, 10000) // 10秒更新一次
  }

  // 處理取消建造事件
  const handleCancelBuildEvent = (event: CustomEvent) => {
    handleCancelBuild(event.detail)
  }

  // 處理取消研究事件
  const handleCancelResearchEvent = (event: CustomEvent) => {
    handleCancelResearch(event.detail)
  }

  // 科樂美秘籍：上上下下左左右右BA
  const setupKonamiCode = () => {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'b', 'a']
    let konamiIndex = 0
    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果已經啟用GM模式，直接返回
      if (gameStore.player.isGMEnabled) return

      const key = event.key.toLowerCase()
      // 檢查是否匹配當前秘籍序列
      if (key === konamiCode[konamiIndex] || event.key === konamiCode[konamiIndex]) {
        konamiIndex++
        // 如果完成整個秘籍序列
        if (konamiIndex === konamiCode.length) {
          gameStore.player.isGMEnabled = true
          // 顯示成功訊息
          toast.success(t('common.gmModeActivated'))
          konamiIndex = 0
        }
      } else {
        // 如果按錯了鍵，重置序列
        konamiIndex = 0
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    // 返回清理函式
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }

  // 開啟重新命名對話方塊
  const openRenameDialog = (planetId: string, currentName: string) => {
    renamingPlanetId.value = planetId
    newPlanetName.value = currentName
    renameDialogOpen.value = true
  }

  // 確認重新命名
  const confirmRenamePlanet = () => {
    if (!renamingPlanetId.value || !newPlanetName.value.trim()) return

    const targetPlanet = gameStore.player.planets.find(p => p.id === renamingPlanetId.value)
    if (targetPlanet) {
      targetPlanet.name = newPlanetName.value.trim()
    }

    renameDialogOpen.value = false
    renamingPlanetId.value = null
    newPlanetName.value = ''
  }

  // 新遊戲：彈出取名對話方塊，等待玩家輸入名字後繼續
  const askPlayerName = (): Promise<string> => {
    newPlayerName.value = t('common.playerName')
    newGameDialogOpen.value = true
    return new Promise(resolve => {
      newGameNameResolve = resolve
    })
  }

  const confirmNewGame = () => {
    const name = newPlayerName.value.trim().slice(0, 24) || t('common.playerName')
    newGameDialogOpen.value = false
    newGameNameResolve?.(name)
    newGameNameResolve = null
    newPlayerName.value = ''
  }

  // 檢查功能是否解鎖
  const isFeatureUnlocked = (path: string): boolean => {
    const requirement = featureRequirements[path]
    if (!requirement) {
      return true
    }
    const currentLevel = planet.value?.buildings[requirement.building] || 0
    return currentLevel >= requirement.level
  }

  // 切換到月球
  const switchToMoon = () => {
    if (moon.value) {
      gameStore.currentPlanetId = moon.value.id
      router.push('/')
    }
  }

  // 切換回母星
  const switchToParentPlanet = () => {
    if (planet.value?.parentPlanetId) {
      gameStore.currentPlanetId = planet.value.parentPlanetId
      router.push('/')
    }
  }

  // 切換到指定星球
  const switchToPlanet = (planetId: string) => {
    gameStore.currentPlanetId = planetId
    router.push('/')
  }

  // 切換側邊欄
  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value
  }

  // 處理側邊欄開啟/關閉狀態變化
  const handleSidebarOpenChange = (open: boolean) => {
    sidebarOpen.value = open
  }

  // 取消建造
  const handleCancelBuild = (queueId: string) => {
    confirmDialogTitle.value = t('queue.cancelBuild')
    confirmDialogMessage.value = t('queue.confirmCancel')
    confirmDialogAction.value = () => {
      if (!gameStore.currentPlanet) return false
      const { item, index } = buildingValidation.findQueueItem(gameStore.currentPlanet.buildQueue, queueId)
      if (!item) return false
      if (item.type === 'building') {
        const refund = buildingValidation.cancelBuildingUpgrade(gameStore.currentPlanet, item)
        resourceLogic.addResources(gameStore.currentPlanet.resources, refund)
      }
      gameStore.currentPlanet.buildQueue.splice(index, 1)
      return true
    }
    confirmDialogOpen.value = true
  }

  // 取消研究
  const handleCancelResearch = (queueId: string) => {
    confirmDialogTitle.value = t('queue.cancelResearch')
    confirmDialogMessage.value = t('queue.confirmCancel')
    confirmDialogAction.value = () => {
      if (!gameStore.currentPlanet) return false
      const { item, index } = buildingValidation.findQueueItem(gameStore.player.researchQueue, queueId)
      if (!item) return false
      if (item.type === 'technology') {
        const refund = researchValidation.cancelTechnologyResearch(item)
        resourceLogic.addResources(gameStore.currentPlanet.resources, refund)
      }
      gameStore.player.researchQueue.splice(index, 1)
      return true
    }
    confirmDialogOpen.value = true
  }

  // 監聽暫停狀態變化
  watch(
    () => gameStore.isPaused,
    isPaused => {
      if (isPaused) {
        stopGameLoop()
      } else {
        startGameLoop()
      }
    }
  )

  // 初始化遊戲
  onMounted(async () => {
    try {
      // BLK-1：從存檔恢復虛擬時間偏移（快轉累積），之後 getGameNow() 全域性一致
      setTimeOffset(gameStore.timeOffset || 0)
      // 如果是首次訪問（沒有星球資料），使用瀏覽器語言自動檢測
      const isFirstVisit = gameStore.player.planets.length === 0
      if (isFirstVisit) {
        gameStore.locale = detectBrowserLocale()
      }
      await initGame()
      // v2→v3 遷移確認門：舊存檔有用副官 → 確認門（繼續使用／暫停副官）；
      // 其餘舊存檔 → 一次性新制說明。選擇後旗標清除＋持久化，重讀不重彈。
      if (shouldShowBillingConfirm(gameStore.player)) {
        billingGateConfirmMode.value = true
        billingGateOpen.value = true
      } else if (shouldShowBillingNotice(gameStore.player)) {
        billingGateConfirmMode.value = false
        billingGateOpen.value = true
      }
      // 啟動遊戲迴圈
      startGameLoop()
      // 啟動積分更新定時器
      startPointsUpdate()
      // 啟動科樂美秘籍監聽
      konamiCleanup.value = setupKonamiCode()

      // 新增佇列取消事件監聽
      window.addEventListener('cancel-build', handleCancelBuildEvent as EventListener)
      window.addEventListener('cancel-research', handleCancelResearchEvent as EventListener)
      // 新增時間快轉事件監聽（總覽頁快轉按鈕派發）
      window.addEventListener('time-skip', handleTimeSkipEvent as EventListener)

      // 首次檢查版本（被動檢測）
      const versionInfo = await checkLatestVersion(gameStore.player.lastVersionCheckTime || 0, (time: number) => {
        gameStore.player.lastVersionCheckTime = time
      })
      if (versionInfo) {
        updateInfo.value = versionInfo
        toast.info(t('settings.newVersionAvailable', { version: versionInfo.version }), {
          duration: Infinity,
          dismissible: true,
          action: {
            label: t('settings.viewUpdate'),
            onClick: () => {
              showUpdateDialog.value = true
            }
          }
        })
      }

      // 檢測舊格式 NPC 名稱
      if (npcStore.npcs.length > 0) {
        const oldCount = countOldFormatNPCs(npcStore.npcs, resolveNPCNameLocale(gameStore.npcNameLocale, gameStore.locale))
        if (oldCount > 0) {
          oldFormatNPCCount.value = oldCount
          npcNameUpdateDialogOpen.value = true
        }
      }

      // Android 返回鍵退出確認
      if (Capacitor.isNativePlatform()) {
        CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            router.back()
          } else {
            exitDialogOpen.value = true
          }
        })
      }

      // 啟動版本檢查定時器（每5分鐘被動檢查一次）
      versionCheckInterval.value = setInterval(async () => {
        const versionInfo = await checkLatestVersion(gameStore.player.lastVersionCheckTime || 0, (time: number) => {
          gameStore.player.lastVersionCheckTime = time
        })
        if (versionInfo) {
          updateInfo.value = versionInfo
          toast.info(t('settings.newVersionAvailable', { version: versionInfo.version }), {
            duration: Infinity,
            dismissible: true,
            action: {
              label: t('settings.viewUpdate'),
              onClick: () => {
                showUpdateDialog.value = true
              }
            }
          })
        }
      }, 5 * 60 * 1000)
    } catch (error) {
      console.error('Error during game initialization:', error)
      // 即使初始化失敗，也嘗試啟動基本的遊戲迴圈
      startGameLoop()
    }
  })

  // 清理定時器
  onUnmounted(() => {
    if (gameLoop.value) clearInterval(gameLoop.value)
    if (pointsUpdateInterval.value) clearInterval(pointsUpdateInterval.value)
    if (konamiCleanup.value) konamiCleanup.value()
    if (versionCheckInterval.value) clearInterval(versionCheckInterval.value)
    // 移除佇列取消事件監聽
    window.removeEventListener('cancel-build', handleCancelBuildEvent as EventListener)
    window.removeEventListener('cancel-research', handleCancelResearchEvent as EventListener)
    window.removeEventListener('time-skip', handleTimeSkipEvent as EventListener)
    // 移除 Android 返回鍵監聽
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.removeAllListeners()
    }
  })

  // Android 退出應用
  const exitApp = () => {
    CapacitorApp.exitApp()
  }

  // NPC 名稱更新處理
  const handleUpdateNPCNames = () => {
    let updatedCount = 0
    npcStore.npcs.forEach(npc => {
      const newName = updateNPCName(npc.id, resolveNPCNameLocale(gameStore.npcNameLocale, gameStore.locale))
      if (newName !== npc.name) {
        npc.name = newName
        updatedCount++
      }
    })
    npcNameUpdateDialogOpen.value = false
    toast.success(t('settings.npcNameUpdateSuccess', { count: updatedCount }))
  }

  const handleSkipNPCNameUpdate = () => {
    npcNameUpdateDialogOpen.value = false
    toast.info(t('settings.npcNameUpdateSkipped'))
  }

  // 副官付費制遷移確認門（v2→v3；文案走 autopilot.contract.* i18n，8 語系）
  const handleBillingGateChoice = (choice: BillingConfirmChoice) => {
    applyBillingConfirmation(gameStore.player, choice)
    billingGateOpen.value = false
    if (choice === 'continue') {
      toast.success(t('autopilot.contract.billingGateContinuedToast'))
    } else {
      toast.info(t('autopilot.contract.billingGatePausedToast'))
    }
  }
  const handleBillingNoticeDismiss = () => {
    dismissBillingNotice(gameStore.player)
    billingGateOpen.value = false
  }
  const onBillingGateEscape = (e: Event) => {
    // 確認門必須二選一：禁止 Esc 直接關閉
    if (billingGateConfirmMode.value) e.preventDefault()
  }
</script>

<style scoped>
  /* 平滑滾動 */
  main {
    scroll-behavior: smooth;
  }
</style>
