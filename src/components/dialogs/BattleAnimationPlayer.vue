<template>
  <div class="battle-animation-container">
    <!-- 播放控制欄 -->
    <div class="flex items-center justify-between gap-2 mb-4 p-3 bg-muted/50 rounded-lg border">
      <div class="flex items-center gap-2">
        <Button variant="outline" size="icon" @click="restart" :disabled="!canRestart">
          <RotateCcw class="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" @click="previousRound" :disabled="!canGoPrevious">
          <SkipBack class="h-4 w-4" />
        </Button>
        <Button :variant="isPlaying ? 'default' : 'outline'" size="icon" @click="togglePlay" :disabled="!canPlay">
          <Pause v-if="isPlaying" class="h-4 w-4" />
          <Play v-else class="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" @click="nextRound" :disabled="!canGoNext">
          <SkipForward class="h-4 w-4" />
        </Button>
      </div>

      <!-- 播放速度 -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ t('messagesView.speed') }}:</span>
        <Select v-model="speedMultiplier">
          <SelectTrigger class="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="z-100">
            <SelectItem value="0.5">0.5x</SelectItem>
            <SelectItem value="1">1x</SelectItem>
            <SelectItem value="2">2x</SelectItem>
            <SelectItem value="4">4x</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- 戰鬥場景 -->
    <div class="battle-scene relative overflow-hidden rounded-lg border bg-gradient-to-b from-slate-900 to-slate-950 p-4 min-h-[300px]">
      <!-- 星空背景 -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div v-for="i in 20" :key="i" class="star" :style="getStarStyle(i)" />
      </div>

      <!-- 攻擊方區域 -->
      <div class="relative z-10 flex justify-between items-center gap-4">
        <!-- 攻擊方艦隊 -->
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <Sword class="h-4 w-4 text-red-400" />
            <span class="text-sm font-medium text-red-400">{{ t('simulatorView.attacker') }}</span>
          </div>
          <div class="fleet-display attacker" :class="{ attacking: attackAnimationPhase === 'attack' }">
            <div class="grid grid-cols-5 gap-1">
              <div
                v-for="(count, shipType) in currentAttackerFleet"
                :key="shipType"
                class="ship-unit flex flex-col items-center p-1.5 rounded bg-red-950/50 border border-red-900/50"
                :class="{ 'exploding': isShipExploding('attacker', shipType as ShipType) }"
              >
                <Rocket class="h-4 w-4 text-red-400" />
                <span class="text-[10px] text-red-300">{{ formatNumber(count, 0) }}</span>
              </div>
            </div>
            <div class="mt-2 text-xs text-red-400/80">{{ t('messagesView.power') }}: {{ formatNumber(currentAttackerPower) }}</div>
          </div>
        </div>

        <!-- VS 標誌 -->
        <div class="flex flex-col items-center gap-2">
          <div
            class="vs-badge w-12 h-12 rounded-full bg-yellow-500/20 border-2 border-yellow-500/50 flex items-center justify-center"
            :class="{ 'pulse-animation': attackAnimationPhase === 'attack' }"
          >
            <Swords class="h-6 w-6 text-yellow-400" />
          </div>
          <!-- 當前回合損失動畫 -->
          <Transition name="damage-popup">
            <div v-if="showDamageNumbers" class="damage-numbers text-center">
              <div v-if="displayedLosses.attacker > 0" class="text-red-400 text-xs font-bold animate-bounce">
                -{{ displayedLosses.attacker }}
              </div>
              <div v-if="displayedLosses.defender > 0" class="text-blue-400 text-xs font-bold animate-bounce">
                -{{ displayedLosses.defender }}
              </div>
            </div>
          </Transition>
        </div>

        <!-- 防守方艦隊 -->
        <div class="flex-1">
          <div class="flex items-center justify-end gap-2 mb-2">
            <span class="text-sm font-medium text-blue-400">{{ t('simulatorView.defender') }}</span>
            <ShieldIcon class="h-4 w-4 text-blue-400" />
          </div>
          <div class="fleet-display defender" :class="{ defending: attackAnimationPhase === 'attack' }">
            <div class="grid grid-cols-5 gap-1 justify-end">
              <div
                v-for="(count, shipType) in currentDefenderFleet"
                :key="shipType"
                class="ship-unit flex flex-col items-center p-1.5 rounded bg-blue-950/50 border border-blue-900/50"
                :class="{ 'exploding': isShipExploding('defender', shipType as string) }"
              >
                <component :is="isDefenseType(String(shipType)) ? Shield : Rocket" class="h-4 w-4 text-blue-400" />
                <span class="text-[10px] text-blue-300">{{ formatNumber(count, 0) }}</span>
              </div>
            </div>
            <div class="mt-2 text-xs text-blue-400/80 text-right">
              {{ t('messagesView.power') }}: {{ formatNumber(currentDefenderPower) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 戰鬥日誌 -->
      <div class="battle-log mt-4 p-3 bg-black/30 rounded border border-white/10 max-h-32 overflow-y-auto">
        <div v-for="(log, index) in battleLogs" :key="index" class="text-xs mb-1" :class="log.type">
          <span class="text-muted-foreground">[{{ log.round }}]</span>
          {{ log.message }}
        </div>
        <div v-if="battleLogs.length === 0" class="text-xs text-muted-foreground text-center py-2">
          {{ t('messagesView.battleLogEmpty') }}
        </div>
      </div>
    </div>

    <!-- 戰鬥結果預覽 (僅在完成時顯示) -->
    <Transition name="fade">
      <div v-if="showResult" class="mt-4 p-4 rounded-lg border text-center" :class="resultStyle">
        <p class="text-lg font-bold">{{ resultText }}</p>
        <p class="text-sm text-muted-foreground mt-1">
          {{ t('simulatorView.afterRounds').replace('{rounds}', String(totalRounds)) }}
        </p>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onUnmounted } from 'vue'
  import { useI18n } from '@/composables/useI18n'
  import { useGameConfig } from '@/composables/useGameConfig'
  import { formatNumber } from '@/utils/format'
  import { Button } from '@/components/ui/button'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { Play, Pause, SkipBack, SkipForward, RotateCcw, Sword, Shield as ShieldIcon, Swords, Rocket, Shield } from 'lucide-vue-next'
  import type { BattleResult, ShipType, DefenseType, Fleet } from '@/types/game'

  const props = defineProps<{
    report: BattleResult
  }>()

  const emit = defineEmits<{
    (e: 'complete'): void
  }>()

  const { t } = useI18n()
  const { SHIPS, DEFENSES } = useGameConfig()

  // 播放狀態
  const isPlaying = ref(false)
  const currentRoundIndex = ref(0)
  const speedMultiplier = ref('1')
  const attackAnimationPhase = ref<'idle' | 'attack' | 'damage'>('idle')
  const showDamageNumbers = ref(false)
  const showResult = ref(false)

  // 爆炸動畫追蹤
  const explodingShips = ref<{ side: 'attacker' | 'defender'; type: string }[]>([])

  // 當前顯示的損失數字（用於動畫顯示）
  const displayedLosses = ref({ attacker: 0, defender: 0 })

  // 戰鬥日誌
  interface BattleLog {
    round: number
    message: string
    type: 'attacker-loss' | 'defender-loss' | 'info'
  }
  const battleLogs = ref<BattleLog[]>([])
  const MAX_LOGS = 100 // 限制日誌數量，防止100回合戰鬥導致效能問題

  // 新增日誌的輔助函式，自動限制數量
  const addBattleLog = (log: BattleLog) => {
    battleLogs.value.push(log)
    // 如果超過最大數量，刪除最舊的日誌
    if (battleLogs.value.length > MAX_LOGS) {
      battleLogs.value = battleLogs.value.slice(-MAX_LOGS)
    }
  }

  // 計算屬性
  const totalRounds = computed(() => props.report.roundDetails?.length || props.report.rounds || 1)

  const canPlay = computed(() => currentRoundIndex.value < totalRounds.value)
  const canGoPrevious = computed(() => currentRoundIndex.value > 0)
  const canGoNext = computed(() => currentRoundIndex.value < totalRounds.value)
  const canRestart = computed(() => currentRoundIndex.value > 0 || battleLogs.value.length > 0)

  // 當前回合的艦隊狀態（透過累計損失計算）
  const currentAttackerFleet = computed(() => {
    const fleet: Partial<Fleet> = { ...props.report.attackerFleet }
    if (props.report.roundDetails) {
      for (let i = 0; i < currentRoundIndex.value; i++) {
        const roundLosses = props.report.roundDetails[i]?.attackerLosses || {}
        for (const [shipType, count] of Object.entries(roundLosses)) {
          if (fleet[shipType as keyof Fleet] !== undefined) {
            fleet[shipType as keyof Fleet] = Math.max(0, (fleet[shipType as keyof Fleet] || 0) - count)
          }
        }
      }
    }
    // 過濾掉數量為0的
    return Object.fromEntries(Object.entries(fleet).filter(([, count]) => count > 0))
  })

  const currentDefenderFleet = computed(() => {
    const fleet: Partial<Fleet> = { ...props.report.defenderFleet }
    const defense: Partial<Record<DefenseType, number>> = { ...props.report.defenderDefense }

    if (props.report.roundDetails) {
      for (let i = 0; i < currentRoundIndex.value; i++) {
        const roundLosses = props.report.roundDetails[i]?.defenderLosses || { fleet: {}, defense: {} }
        for (const [shipType, count] of Object.entries(roundLosses.fleet || {})) {
          if (fleet[shipType as keyof Fleet] !== undefined) {
            fleet[shipType as keyof Fleet] = Math.max(0, (fleet[shipType as keyof Fleet] || 0) - count)
          }
        }
        for (const [defType, count] of Object.entries(roundLosses.defense || {})) {
          if (defense[defType as DefenseType] !== undefined) {
            defense[defType as DefenseType] = Math.max(0, (defense[defType as DefenseType] || 0) - count)
          }
        }
      }
    }

    // 合併艦隊和防禦
    const combined = {
      ...Object.fromEntries(Object.entries(fleet).filter(([, count]) => count > 0)),
      ...Object.fromEntries(Object.entries(defense).filter(([, count]) => count > 0))
    }
    return combined
  })

  const currentAttackerPower = computed(() => {
    if (props.report.roundDetails && currentRoundIndex.value > 0) {
      return props.report.roundDetails[currentRoundIndex.value - 1]?.attackerRemainingPower || 0
    }
    // 初始戰鬥力
    return calculateFleetPower(props.report.attackerFleet)
  })

  const currentDefenderPower = computed(() => {
    if (props.report.roundDetails && currentRoundIndex.value > 0) {
      return props.report.roundDetails[currentRoundIndex.value - 1]?.defenderRemainingPower || 0
    }
    // 初始戰鬥力
    return calculateFleetPower(props.report.defenderFleet) + calculateDefensePower(props.report.defenderDefense)
  })

  const resultStyle = computed(() => {
    if (props.report.winner === 'draw') {
      return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
    }
    if (props.report.winner === 'attacker') {
      return 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
    }
    return 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
  })

  const resultText = computed(() => {
    if (props.report.winner === 'draw') return t('messagesView.draw')
    if (props.report.winner === 'attacker') return t('messagesView.attackerWins')
    return t('messagesView.defenderWins')
  })

  // 輔助函式
  const calculateFleetPower = (fleet: Partial<Fleet>): number => {
    let power = 0
    for (const [shipType, count] of Object.entries(fleet)) {
      const config = SHIPS.value[shipType as ShipType]
      if (config) {
        power += (config.attack + config.shield + config.armor) * count
      }
    }
    return power
  }

  const calculateDefensePower = (defense: Partial<Record<DefenseType, number>>): number => {
    let power = 0
    for (const [defType, count] of Object.entries(defense)) {
      const config = DEFENSES.value[defType as DefenseType]
      if (config) {
        power += (config.attack + config.shield + config.armor) * count
      }
    }
    return power
  }

  const isDefenseType = (type: string): boolean => {
    return type in DEFENSES.value
  }

  const isShipExploding = (side: 'attacker' | 'defender', type: string): boolean => {
    return explodingShips.value.some(s => s.side === side && s.type === type)
  }

  const getStarStyle = (index: number): Record<string, string> => {
    const seed = index * 1234
    const x = seed % 100
    const y = (seed * 7) % 100
    const size = 1 + (seed % 2)
    const opacity = 0.3 + (seed % 5) / 10
    const delay = seed % 3000

    return {
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: 'white',
      borderRadius: '50%',
      opacity: String(opacity),
      animation: `twinkle 2s ease-in-out ${delay}ms infinite`
    }
  }

  // 播放控制
  let playTimeoutId: ReturnType<typeof setTimeout> | null = null
  let isPlayingRound = false // 防止重複執行

  const togglePlay = () => {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  const play = () => {
    if (currentRoundIndex.value >= totalRounds.value) {
      restart()
    }
    isPlaying.value = true
    scheduleNextRound()
  }

  const pause = () => {
    isPlaying.value = false
    if (playTimeoutId) {
      clearTimeout(playTimeoutId)
      playTimeoutId = null
    }
  }

  const scheduleNextRound = () => {
    if (!isPlaying.value) return
    if (playTimeoutId) clearTimeout(playTimeoutId)

    // 使用 setTimeout 而非 setInterval，確保每回合順序執行
    playTimeoutId = setTimeout(async () => {
      if (!isPlaying.value) return
      if (currentRoundIndex.value < totalRounds.value) {
        await playRound()
        scheduleNextRound() // 回合完成後再排程下一回合
      } else {
        pause()
        showResult.value = true
        emit('complete')
      }
    }, 100) // 短暫延遲啟動
  }

  const playRound = async () => {
    if (isPlayingRound) return // 防止重複執行
    if (currentRoundIndex.value >= totalRounds.value) return

    isPlayingRound = true
    try {
      const speed = parseFloat(speedMultiplier.value) || 1
      const roundIndex = currentRoundIndex.value
      const roundData = props.report.roundDetails?.[roundIndex]

      // 攻擊動畫階段
      attackAnimationPhase.value = 'attack'

      // 新增日誌
      addBattleLog({
        round: roundIndex + 1,
        message: t('messagesView.roundStarted').replace('{round}', String(roundIndex + 1)),
        type: 'info'
      })

      // 等待攻擊動畫
      await sleep(400 / speed)

      // 傷害階段
      attackAnimationPhase.value = 'damage'

      // 計算當前回合的損失數字
      if (roundData) {
        const attackerLoss = Object.values(roundData.attackerLosses || {}).reduce((sum, count) => sum + count, 0)
        const defenderLoss =
          Object.values(roundData.defenderLosses?.fleet || {}).reduce((sum, count) => sum + count, 0) +
          Object.values(roundData.defenderLosses?.defense || {}).reduce((sum, count) => sum + count, 0)
        displayedLosses.value = { attacker: attackerLoss, defender: defenderLoss }
      } else {
        displayedLosses.value = { attacker: 0, defender: 0 }
      }
      showDamageNumbers.value = true

      if (roundData) {
        // 記錄攻擊方損失
        for (const [shipType, count] of Object.entries(roundData.attackerLosses || {})) {
          if (count > 0) {
            explodingShips.value.push({ side: 'attacker', type: shipType })
            addBattleLog({
              round: roundIndex + 1,
              message: t('messagesView.shipDestroyed')
                .replace('{count}', String(count))
                .replace('{ship}', SHIPS.value[shipType as ShipType]?.name || shipType),
              type: 'attacker-loss'
            })
          }
        }

        // 記錄防守方損失
        for (const [shipType, count] of Object.entries(roundData.defenderLosses?.fleet || {})) {
          if (count > 0) {
            explodingShips.value.push({ side: 'defender', type: shipType })
            addBattleLog({
              round: roundIndex + 1,
              message: t('messagesView.shipDestroyed')
                .replace('{count}', String(count))
                .replace('{ship}', SHIPS.value[shipType as ShipType]?.name || shipType),
              type: 'defender-loss'
            })
          }
        }

        for (const [defType, count] of Object.entries(roundData.defenderLosses?.defense || {})) {
          if (count > 0) {
            explodingShips.value.push({ side: 'defender', type: defType })
            addBattleLog({
              round: roundIndex + 1,
              message: t('messagesView.defenseDestroyed')
                .replace('{count}', String(count))
                .replace('{defense}', DEFENSES.value[defType as DefenseType]?.name || defType),
              type: 'defender-loss'
            })
          }
        }
      }

      // 等待傷害顯示
      await sleep(600 / speed)

      // 清理狀態
      attackAnimationPhase.value = 'idle'
      showDamageNumbers.value = false
      explodingShips.value = []

      currentRoundIndex.value++
    } finally {
      // 確保鎖始終被釋放，即使發生錯誤
      isPlayingRound = false
    }
  }

  const nextRound = async () => {
    if (currentRoundIndex.value < totalRounds.value) {
      pause()
      await playRound()
    }
  }

  const previousRound = () => {
    if (currentRoundIndex.value > 0) {
      pause()
      currentRoundIndex.value--
      // 移除該回合的日誌
      battleLogs.value = battleLogs.value.filter(log => log.round <= currentRoundIndex.value)
      showResult.value = false
    }
  }

  const restart = () => {
    pause()
    currentRoundIndex.value = 0
    battleLogs.value = []
    showResult.value = false
    explodingShips.value = []
    attackAnimationPhase.value = 'idle'
    showDamageNumbers.value = false
    displayedLosses.value = { attacker: 0, defender: 0 }
  }

  const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // 監聽速度變化
  watch(speedMultiplier, () => {
    if (isPlaying.value) {
      scheduleNextRound()
    }
  })

  // 清理
  onUnmounted(() => {
    if (playTimeoutId) {
      clearTimeout(playTimeoutId)
    }
  })

  // 暴露給父元件
  defineExpose({
    currentRoundIndex,
    totalRounds
  })
</script>

<style scoped>
  .star {
    will-change: opacity;
  }

  @keyframes twinkle {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.8;
    }
  }

  .fleet-display {
    will-change: transform;
  }

  .fleet-display.attacking {
    animation: shake 0.3s ease-in-out;
  }

  .fleet-display.defending {
    animation: shake 0.3s ease-in-out 0.1s;
  }

  @keyframes shake {
    0%,
    100% {
      transform: translate3d(0, 0, 0);
    }
    25% {
      transform: translate3d(-3px, 0, 0);
    }
    75% {
      transform: translate3d(3px, 0, 0);
    }
  }

  .ship-unit {
    will-change: transform, opacity;
  }

  .ship-unit.exploding {
    animation: explode 0.5s ease-out forwards;
  }

  @keyframes explode {
    0% {
      transform: scale3d(1, 1, 1);
      opacity: 1;
    }
    50% {
      transform: scale3d(1.3, 1.3, 1);
      opacity: 0.5;
      background-color: rgba(239, 68, 68, 0.5);
    }
    100% {
      transform: scale3d(0.8, 0.8, 1);
      opacity: 0.3;
    }
  }

  .vs-badge {
    will-change: transform;
  }

  .pulse-animation {
    animation: pulse 0.5s ease-in-out;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale3d(1, 1, 1);
    }
    50% {
      transform: scale3d(1.2, 1.2, 1);
    }
  }

  .damage-popup-enter-active,
  .damage-popup-leave-active {
    transition: all 0.3s ease;
  }

  .damage-popup-enter-from {
    opacity: 0;
    transform: translate3d(0, 10px, 0);
  }

  .damage-popup-leave-to {
    opacity: 0;
    transform: translate3d(0, -10px, 0);
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.5s ease;
  }

  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }

  .battle-log .attacker-loss {
    color: rgb(248, 113, 113);
  }

  .battle-log .defender-loss {
    color: rgb(96, 165, 250);
  }

  .battle-log .info {
    color: rgb(156, 163, 175);
  }
</style>
