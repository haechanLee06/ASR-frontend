<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { getDashboardAmbient, getDashboardHealth } from '@/api/audio'

// ─── 用户信息 ──────────────────────────────────────────────────────────────
const userStore = useUserStore()
const username  = computed(() => userStore.username || 'hae')

// ─── 动态问候语 ────────────────────────────────────────────────────────────
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

// ─── 环境 & 健康数据 ────────────────────────────────────────────────────────
const ambientData = ref({
  location:     '未知地区',
  weather:      '无法获取',
  temperature:  '--',
  uptime_days:  '--',
  uptime_hours: '--',
})

const healthData = ref({
  asr_online: false,
  llm_online: false,
})

const loadingAmbient = ref(true)
const loadingHealth  = ref(true)

onMounted(async () => {
  // 并行发起两个请求，互不阻塞
  const [ambientResult, healthResult] = await Promise.allSettled([
    getDashboardAmbient(),
    getDashboardHealth(),
  ])

  if (ambientResult.status === 'fulfilled') {
    const d = ambientResult.value?.data || {}
    ambientData.value = {
      location:     d.location     ?? '未知地区',
      weather:      d.weather      ?? '无法获取',
      temperature:  d.temperature  ?? '--',
      uptime_days:  d.uptime_days  ?? '--',
      uptime_hours: d.uptime_hours ?? '--',
    }
  }
  loadingAmbient.value = false

  if (healthResult.status === 'fulfilled') {
    const d = healthResult.value?.data || {}
    healthData.value = {
      asr_online: !!d.asr_online,
      llm_online: !!d.llm_online,
    }
  }
  loadingHealth.value = false
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
        
        <template v-if="loadingAmbient">
          <span class="inline-block w-32 h-3.5 bg-[#f5f5f5] rounded animate-pulse"></span>
        </template>
        <template v-else>
          <span>{{ ambientData.location }} · {{ ambientData.weather }} {{ ambientData.temperature }}°C</span>
        </template>
        
        <template v-if="loadingAmbient">
          <span class="inline-block w-24 h-3.5 bg-[#f5f5f5] rounded animate-pulse"></span>
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
        <template v-if="!loadingHealth && healthData.asr_online">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#000000]"></span>
          </span>
          <span>Paraformer: <span class="text-[#000000] font-semibold ml-0.5">Online</span></span>
        </template>
        <template v-else>
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2" :class="loadingHealth ? 'bg-[#e5e5e5] animate-pulse' : 'bg-rose-500'"></span>
          </span>
          <span>Paraformer: <span class="ml-0.5" :class="loadingHealth ? 'text-[#777169]' : 'text-rose-500'">{{ loadingHealth ? '...' : 'Offline' }}</span></span>
        </template>
      </div>

      <!-- Qwen -->
      <div class="bg-white border border-[#e5e5e5] shadow-xs-inset rounded-[9999px] px-4 py-1.5 text-[12px] font-medium text-[#4e4e4e] flex items-center gap-2">
        <template v-if="!loadingHealth && healthData.llm_online">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-[#000000]"></span>
          </span>
          <span>Qwen: <span class="text-[#000000] font-semibold ml-0.5">Online</span></span>
        </template>
        <template v-else>
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex rounded-full h-2 w-2" :class="loadingHealth ? 'bg-[#e5e5e5] animate-pulse' : 'bg-rose-500'"></span>
          </span>
          <span>Qwen: <span class="ml-0.5" :class="loadingHealth ? 'text-[#777169]' : 'text-rose-500'">{{ loadingHealth ? '...' : 'Offline' }}</span></span>
        </template>
      </div>
    </div>

  </div>
</template>
