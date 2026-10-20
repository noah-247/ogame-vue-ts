<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/50 p-4">
    <!-- 主視覺橫幅 -->
    <div class="w-full max-w-3xl mx-auto mb-8 animate-fade-in">
      <div class="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl">
        <img src="@/assets/welcome-hero.webp" alt="OGame fleet" class="w-full aspect-video object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent pointer-events-none" />
        <div class="absolute bottom-0 inset-x-0 p-4 sm:p-6 text-center">
          <h1 class="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent drop-shadow">
            {{ pkg.title }}
          </h1>
          <p class="text-muted-foreground mt-2 text-sm sm:text-base">{{ t('home.subtitle') }}</p>
        </div>
      </div>
    </div>

    <!-- 開始遊戲按鈕 -->
    <div class="flex flex-col gap-4 w-full max-w-xs mb-8">
      <Button size="lg" class="w-full text-lg h-14" @click="handleStartGame">
        <Rocket class="mr-2 h-5 w-5" />
        {{ t('home.startGame') }}
      </Button>
    </div>

    <!-- 底部操作按鈕 -->
    <div class="flex flex-wrap items-center justify-center gap-4">
      <!-- 語言切換 -->
      <Popover>
        <PopoverTrigger as-child>
          <Button variant="outline" size="sm">
            <Languages class="mr-2 h-4 w-4" />
            {{ localeNames[gameStore.locale] }}
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-48 p-2" side="top">
          <div class="space-y-1">
            <Button
              v-for="locale in availableLocales"
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

      <!-- 隱私協議按鈕 -->
      <Button variant="ghost" size="sm" @click="showPrivacyDialog = true">
        <Shield class="mr-2 h-4 w-4" />
        {{ t('settings.privacyPolicy') }}
      </Button>

      <!-- 開源倉庫連結（本 fork） -->
      <Button variant="ghost" size="sm" as-child>
        <a href="https://github.com/noah-247/ogame-vue-ts" target="_blank" rel="noopener">
          <Github class="mr-2 h-4 w-4" />
          GitHub
        </a>
      </Button>
    </div>

    <!-- 隱私協議彈窗 -->
    <PrivacyDialog v-model:open="showPrivacyDialog" />

    <!-- 隱私協議同意確認彈窗（開始遊戲時） -->
    <AlertDialog v-model:open="showAgreementDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('home.privacyAgreement') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('home.privacyAgreementDesc') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div class="my-4 max-h-48 overflow-y-auto text-sm text-muted-foreground border rounded-lg p-3">
          <p>{{ t('privacy.sections.introduction.content') }}</p>
          <p class="mt-2">{{ t('privacy.sections.dataCollection.content') }}</p>
          <p class="mt-2">{{ t('privacy.sections.thirdParty.content') }}</p>
        </div>
        <div class="flex items-center gap-2 mb-4">
          <Checkbox id="privacy-agree" v-model="privacyAgreed" />
          <label for="privacy-agree" class="text-sm cursor-pointer">
            {{ t('home.agreeToPrivacy') }}
            <Button variant="link" class="p-0 h-auto text-sm" @click.prevent="showPrivacyDialog = true">
              {{ t('home.viewFullPolicy') }}
            </Button>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel @click="privacyAgreed = false">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction :disabled="!privacyAgreed" @click="confirmStartGame">
            {{ t('home.agreeAndStart') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useGameStore } from '@/stores/gameStore'
  import { useI18n } from '@/composables/useI18n'
  import { localeNames, type Locale } from '@/locales'
  import { Button } from '@/components/ui/button'
  import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
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
  import { Checkbox } from '@/components/ui/checkbox'
  import { Rocket, Languages, Shield, Github } from 'lucide-vue-next'
  import PrivacyDialog from '@/components/dialogs/PrivacyDialog.vue'
  import pkg from '../../package.json'

  const router = useRouter()
  const gameStore = useGameStore()
  const { t } = useI18n()

  const showPrivacyDialog = ref(false)
  const showAgreementDialog = ref(false)
  const privacyAgreed = ref(false)

  const availableLocales: Locale[] = ['zh-CN', 'zh-TW', 'en', 'de', 'ru', 'ko', 'ja']

  // 處理開始遊戲
  const handleStartGame = () => {
    // 如果已經同意過，直接進入總覽頁面
    if (gameStore.player.privacyAgreed) {
      router.push('/overview')
    } else {
      // 顯示同意彈窗
      showAgreementDialog.value = true
    }
  }

  // 確認開始遊戲
  const confirmStartGame = () => {
    if (privacyAgreed.value) {
      gameStore.player.privacyAgreed = true
      showAgreementDialog.value = false
      router.push('/overview')
    }
  }
</script>

<style scoped>
  .animate-fade-in {
    animation: fadeIn 0.5s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate3d(0, -10px, 0);
    }
    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }
</style>
