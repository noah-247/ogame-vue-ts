<template>
  <component :is="icons[type]" :class="[colors[type], sizes[size], 'shrink-0']" :aria-label="title" role="img" />
</template>

<script setup lang="ts">
  import { Gem, Zap, Droplet, Sparkles, Pickaxe } from 'lucide-vue-next'

  interface Props {
    type: 'metal' | 'crystal' | 'deuterium' | 'darkMatter' | 'energy'
    size?: 'sm' | 'md' | 'lg'
    /** 無障礙/懸停提示的資源名稱 */
    title?: string
  }

  withDefaults(defineProps<Props>(), {
    size: 'md',
    title: undefined
  })

  // Lucide SVG 圖示（SVG 在 Android WebView 同樣可靠，比純色塊更易辨認）
  const icons = {
    metal: Pickaxe,
    crystal: Gem,
    deuterium: Droplet,
    darkMatter: Sparkles,
    energy: Zap
  }

  const colors = {
    metal: 'text-slate-500',
    crystal: 'text-cyan-500',
    deuterium: 'text-green-500',
    darkMatter: 'text-purple-500',
    energy: 'text-yellow-500'
  }

  const sizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }
</script>
