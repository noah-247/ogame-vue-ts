<template>
  <img
    v-if="src && visible"
    loading="lazy"
    :src="src"
    :alt="alt"
    class="w-full aspect-square object-cover rounded-t-xl ring-1 ring-inset ring-black/10 dark:ring-0"
    @error="visible = false"
  />
</template>

<script setup lang="ts">
  import { ref } from 'vue'

  interface Props {
    src?: string
    alt: string
  }

  defineProps<Props>()

  const visible = ref(true)
</script>
