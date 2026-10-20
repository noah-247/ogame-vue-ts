import { createRouter, createWebHashHistory } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/overview', name: 'overview', component: () => import('@/views/OverviewView.vue') },
    { path: '/buildings', name: 'buildings', component: () => import('@/views/BuildingsView.vue') },
    { path: '/research', name: 'research', component: () => import('@/views/ResearchView.vue') },
    { path: '/shipyard', name: 'shipyard', component: () => import('@/views/ShipyardView.vue') },
    { path: '/defense', name: 'defense', component: () => import('@/views/DefenseView.vue') },
    { path: '/fleet', name: 'fleet', component: () => import('@/views/FleetView.vue') },
    { path: '/officers', name: 'officers', component: () => import('@/views/OfficersView.vue') },
    { path: '/battle-simulator', name: 'battle-simulator', component: () => import('@/views/BattleSimulatorView.vue') },
    { path: '/messages', name: 'messages', component: () => import('@/views/MessagesView.vue') },
    { path: '/galaxy', name: 'galaxy', component: () => import('@/views/GalaxyView.vue') },
    { path: '/diplomacy', name: 'diplomacy', component: () => import('@/views/DiplomacyView.vue') },
    { path: '/achievements', name: 'achievements', component: () => import('@/views/AchievementsView.vue') },
    { path: '/campaign', name: 'campaign', component: () => import('@/views/CampaignView.vue') },
    { path: '/ranking', name: 'ranking', component: () => import('@/views/RankingView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/autopilot', name: 'autopilot', component: () => import('@/views/AutopilotView.vue') },
    { path: '/gm', name: 'gm', component: () => import('@/views/GMView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
  ]
})

// 路由守衛：檢查隱私協議同意狀態
router.beforeEach((to, _from, next) => {
  const gameStore = useGameStore()

  // 已同意隱私協議
  if (gameStore.player.privacyAgreed) {
    // 已同意但訪問首頁，重定向到總覽頁
    if (to.path === '/') {
      next('/overview')
      return
    }
    // 正常訪問其他頁面
    next()
    return
  }

  // 未同意隱私協議
  // 允許訪問首頁（用於顯示隱私協議同意彈窗）
  if (to.path === '/') {
    next()
    return
  }

  // 未同意隱私協議且訪問其他頁面，重定向到首頁
  next('/')
})

export default router
