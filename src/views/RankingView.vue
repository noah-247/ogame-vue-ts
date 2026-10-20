<template>
  <div class="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex flex-row items-center justify-between gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold">{{ t('ranking.title') }}</h1>
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Users class="h-4 w-4" />
        {{ t('ranking.totalPlayers', { count: rankingData.length }) }}
      </div>
    </div>

    <!-- 玩家排名概覽 -->
    <div class="flex items-center gap-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
      <Crown class="h-5 w-5 text-yellow-500 shrink-0" />
      <span class="text-sm text-muted-foreground">{{ t('ranking.yourRanking') }}</span>
      <span class="text-xl font-bold">#{{ playerRank }}</span>
      <span class="text-sm text-muted-foreground">/ {{ rankingData.length }}</span>
      <span class="ml-auto text-lg font-bold text-primary">{{ formatNumber(playerScore) }}</span>
    </div>

    <!-- 分類標籤 -->
    <Tabs v-model="activeCategory" class="w-full">
      <TabsList class="w-full grid grid-cols-5 h-10">
        <TabsTrigger v-for="category in categories" :key="category.value" :value="category.value" class="text-xs sm:text-sm">
          <component :is="getCategoryIcon(category.value)" class="h-4 w-4 mr-1 hidden sm:inline" />
          {{ t(`ranking.categories.${category.value}`) }}
        </TabsTrigger>
      </TabsList>

      <!-- 排行榜列表 -->
      <TabsContent v-for="category in categories" :key="category.value" :value="category.value" class="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-16 text-center">#</TableHead>
              <TableHead>{{ t('ranking.name') }}</TableHead>
              <TableHead>{{ t(`ranking.categories.${activeCategory}`) }}</TableHead>
              <TableHead>{{ t('ranking.planets') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(entry, index) in paginatedRanking" :key="entry.id" :class="{ 'bg-primary/5': entry.isPlayer }">
              <TableCell class="text-center">
                <div
                  class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold mx-auto"
                  :class="getRankBadgeClass(getActualRank(index))"
                >
                  {{ getActualRank(index) }}
                </div>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-1">
                  <span class="font-medium truncate" :class="{ 'text-primary': entry.isPlayer }">
                    {{ entry.name }}
                  </span>
                  <Badge v-if="entry.isPlayer" variant="outline" class="text-[10px] px-1 shrink-0">
                    {{ t('ranking.you') }}
                  </Badge>
                </div>
              </TableCell>
              <TableCell class="font-mono">
                {{ formatNumber(entry.scores[activeCategory]) }}
              </TableCell>
              <TableCell class="table-cell">
                <div class="flex items-center gap-1 text-muted-foreground">
                  <Globe class="h-4 w-4" />
                  {{ entry.planetCount }}
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="rankingData.length === 0">
              <TableCell class="text-center text-muted-foreground py-8">
                {{ t('ranking.noData') }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
    <!-- 分頁 -->
    <FixedPagination v-model:page="currentPage" :total-pages="totalPages" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useGameStore } from '@/stores/gameStore'
  import { useNPCStore } from '@/stores/npcStore'
  import { useI18n } from '@/composables/useI18n'
  import { formatNumber } from '@/utils/format'
  import { Badge } from '@/components/ui/badge'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
  import { FixedPagination } from '@/components/ui/pagination'
  import { RankingCategory, type RankingEntry } from '@/types/game'
  import { getRanking } from '@/logic/rankingLogic'
  import { Crown, Users, Globe, Trophy, Building2, FlaskConical, Rocket, Shield } from 'lucide-vue-next'

  const { t } = useI18n()
  const gameStore = useGameStore()
  const npcStore = useNPCStore()

  const activeCategory = ref<RankingCategory>(RankingCategory.Total)

  // 分頁
  const ITEMS_PER_PAGE = 10
  const currentPage = ref(1)

  const categories = [
    { value: RankingCategory.Total },
    { value: RankingCategory.Building },
    { value: RankingCategory.Research },
    { value: RankingCategory.Fleet },
    { value: RankingCategory.Defense }
  ]

  // 獲取排行榜資料
  const rankingData = computed<RankingEntry[]>(() => {
    return getRanking(gameStore.player, npcStore.npcs, activeCategory.value)
  })

  // 按當前類別排序的排行榜
  const sortedRanking = computed(() => {
    return [...rankingData.value].sort((a, b) => b.scores[activeCategory.value] - a.scores[activeCategory.value])
  })

  // 總頁數
  const totalPages = computed(() => Math.ceil(sortedRanking.value.length / ITEMS_PER_PAGE))

  // 分頁後的排行榜
  const paginatedRanking = computed(() => {
    const start = (currentPage.value - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE
    return sortedRanking.value.slice(start, end)
  })

  // 獲取實際排名（考慮分頁偏移）
  const getActualRank = (index: number): number => {
    return (currentPage.value - 1) * ITEMS_PER_PAGE + index + 1
  }

  // 切換分類時重置頁碼
  watch(activeCategory, () => {
    currentPage.value = 1
  })

  // 玩家當前排名
  const playerRank = computed(() => {
    const index = sortedRanking.value.findIndex(entry => entry.isPlayer)
    return index >= 0 ? index + 1 : '-'
  })

  // 玩家當前積分
  const playerScore = computed(() => {
    const playerEntry = rankingData.value.find(entry => entry.isPlayer)
    return playerEntry?.scores[activeCategory.value] || 0
  })

  // 獲取類別圖示
  const getCategoryIcon = (category: RankingCategory) => {
    switch (category) {
      case RankingCategory.Total:
        return Trophy
      case RankingCategory.Building:
        return Building2
      case RankingCategory.Research:
        return FlaskConical
      case RankingCategory.Fleet:
        return Rocket
      case RankingCategory.Defense:
        return Shield
    }
  }

  // 獲取排名徽章樣式
  const getRankBadgeClass = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500 text-yellow-950'
      case 2:
        return 'bg-gray-400 text-gray-900'
      case 3:
        return 'bg-amber-600 text-amber-100'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }
</script>
