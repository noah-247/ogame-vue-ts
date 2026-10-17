<template>
  <!-- 固定 aspect-square 占位：加载失败也不坍塌，避免下方卡片内容上跳（CLS） -->
  <div
    class="w-full aspect-square rounded-xl bg-muted/50 ring-1 ring-inset ring-black/10 dark:ring-white/10 overflow-hidden"
  >
    <img
      v-if="src && visible"
      loading="lazy"
      :src="src"
      :alt="alt"
      class="w-full h-full object-cover transition-all duration-300"
      :class="{ 'blur-md brightness-[0.65] saturate-50': locked }"
      @error="visible = false"
    />
    <div v-else class="w-full h-full flex items-center justify-center">
      <ImageOff class="h-8 w-8 text-muted-foreground/50" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ImageOff } from 'lucide-vue-next'

  interface Props {
    src?: string
    alt: string
    /** 鎖定時模糊圖片，與 CardUnlockOverlay 的遮罩呼應 */
    locked?: boolean
  }

  defineProps<Props>()

  const visible = ref(true)
</script>
