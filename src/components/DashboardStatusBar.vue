<script setup>
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

const props = defineProps({
  ambientData: {
    type: Object,
    default: () => ({
      location: '未知地区',
      weather: '无法获取',
      temperature: '--',
      uptime_days: '--',
      uptime_hours: '--',
    })
  },
  healthData: {
    type: Object,
    default: () => ({
      asr_online: false,
      llm_online: false,
    })
  },
  loading: {
    type: Boolean,
    default: true
  }
})

// ─── 用户信息 ──────────────────────────────────────────────────────────────
const userStore = useUserStore()
const username  = computed(() => userStore.username || 'hae')

// ─── 动态问候语 ────────────────────────────────────────────────────────────
const greeting = computed(() => {
  const h = new Date().getHours()
  let greet
  if      (h <= 5)  greet = '凌晨好'
  else if (h <= 11) greet = '上午好'
  else if (h <= 13) greet = '中午好'
  else if (h <= 18) greet = '下午好'
  else              greet = '晚上好'
  return `${greet}，${username.value}。`
})

// ─── 当前日期 ──────────────────────────────────────────────────────────────
const currentDate = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
})
</script>

<template>
  <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">

    <!-- ══ LEFT: 问候 + 环境信息 ══ -->
    <div>
      <h1 class="text-[36px] font-[300] tracking-[-0.96px] text-[#000000]" style="font-family: 'Waldenburg', sans-serif;">
        {{ greeting }}
      </h1>
      <p class="text-[14px] text-[#777169] mt-2 font-[400] tracking-[0.16px] flex items-center flex-wrap gap-x-3 gap-y-1">
        <span>{{ currentDate }}</span>
        
        <template v-if="loading">
          <span class="inline-block w-32 h-3.5 bg-[#f5f5f5] rounded skeleton-pulse"></span>
        </template>
        <template v-else>
          <span>{{ ambientData.location }} · {{ ambientData.weather }} {{ ambientData.temperature }}°C</span>
        </template>
        
        <template v-if="loading">
          <span class="inline-block w-24 h-3.5 bg-[#f5f5f5] rounded skeleton-pulse"></span>
        </template>
        <template v-else>
          <span>系统已运行 {{ ambientData.uptime_days }}天 {{ ambientData.uptime_hours }}小时</span>
        </template>
      </p>
    </div>

    <!-- ══ RIGHT: 引擎状态改为极简指示 ══ -->
    <div class="flex gap-3 flex-shrink-0">
      <!-- Paraformer -->
      <div class="bg-white border border-[#e5e5e5] shadow-xs-inset rounded-[9999px] px-4 py-1.5 text-[12px] font-medium text-[#4e4e4e] flex items-center gap-2">
        <template v-if="!loading && healthData.asr_online">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Paraformer <span class="text-[#aaa] font-normal">(语音识别)</span>: <span class="text-emerald-600 font-semibold ml-0.5">在线</span></span>
        </template>
        <template v-else-if="loading">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#f5f5f5] animate-pulse"></span>
          </span>
          <span>Paraformer <span class="text-[#aaa] font-normal">(语音识别)</span>: <span class="ml-0.5 text-[#e5e5e5]">Loading...</span></span>
        </template>
        <template v-else>
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-400"></span>
          </span>
          <span>Paraformer <span class="text-[#aaa] font-normal">(语音识别)</span>: <span class="ml-0.5 text-rose-500/80">离线</span></span>
        </template>
      </div>

      <!-- Qwen -->
      <div class="bg-white border border-[#e5e5e5] shadow-xs-inset rounded-[9999px] px-4 py-1.5 text-[12px] font-medium text-[#4e4e4e] flex items-center gap-2">
        <template v-if="!loading && healthData.llm_online">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Qwen <span class="text-[#aaa] font-normal">(语言模型)</span>: <span class="text-emerald-600 font-semibold ml-0.5">在线</span></span>
        </template>
        <template v-else-if="loading">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#f5f5f5] animate-pulse"></span>
          </span>
          <span>Qwen <span class="text-[#aaa] font-normal">(语言模型)</span>: <span class="ml-0.5 text-[#e5e5e5]">Loading...</span></span>
        </template>
        <template v-else>
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-400"></span>
          </span>
          <span>Qwen <span class="text-[#aaa] font-normal">(语言模型)</span>: <span class="ml-0.5 text-rose-500/80">离线</span></span>
        </template>
      </div>
    </div>

  </div>
</template>

