<script setup>
import { onMounted, onUnmounted, ref, computed, watch, onActivated } from 'vue'

defineOptions({
  name: 'Dashboard'
})
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadAudio, getDetail, deleteRecord, getDashboardStats, getDashboardKeywords, getDashboardRecentRecords, getDashboardAmbient, getDashboardHealth } from '@/api/audio'
import { useRouter } from 'vue-router'
import { UploadFilled, View, Loading, Delete } from '@element-plus/icons-vue'
import DashboardStatusBar from '@/components/DashboardStatusBar.vue'
import * as echarts from 'echarts';
import 'echarts-wordcloud';

const router = useRouter()
const taskStore = useTaskStore()
const { tasks } = storeToRefs(taskStore)
let pollTimer = null

// Session start time to track "NEW" records
const sessionStartTime = ref(Date.now())

// ─── 区块二：数据速览 & 文件上传 ────────────────────────────────────────────
const stats = ref({ total_transcribed: 0, total_summarized: 0 })
const uptime = ref({ days: 0, hours: 0 })
const fileInput = ref(null)
const isUploading = ref(false)
const isDragging = ref(false)
const isPageLoading = ref(true)

const ambientData = ref({
  location: '未知地区',
  weather: '无法获取',
  temperature: '--',
  uptime_days: '--',
  uptime_hours: '--',
})

const healthData = ref({
  asr_online: false,
  llm_online: false,
})

const activeTask = computed(() => {
  return tasks.value.find(t => ['pending', 'processing'].includes(t.status))
})

const isProcessing = computed(() => isUploading.value || !!activeTask.value)

const fakeProgress = ref(0)
let fakeProgressInterval = null

const currentProgress = computed(() => {
  if (isUploading.value) return Math.floor(fakeProgress.value)
  if (activeTask.value) {
    if (activeTask.value.progress && activeTask.value.progress > 0) return activeTask.value.progress
    return Math.floor(fakeProgress.value)
  }
  return 0
})

const currentStatusText = computed(() => {
  if (isUploading.value) return '正在上传音频文件...'
  if (activeTask.value) {
    if (activeTask.value.status === 'pending') return '文件已进入排队，等待引擎调度...'
    return activeTask.value.current_stage || 'Paraformer 引擎正在转写中...'
  }
  return '系统处理中...'
})

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  await handleUpload({ file })
  e.target.value = ''
}

function handleDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e) {
  e.preventDefault()
  isDragging.value = false
}

async function handleDrop(e) {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  console.log('User dropped file:', e.dataTransfer?.files)
  if (!file) return
  if (!file.type.startsWith('audio/')) {
    ElMessage.warning('请上传音频格式文件')
    return
  }
  await handleUpload({ file })
}

async function handleUpload(options) {
  try {
    const raw = options.file?.raw || options.file
    isUploading.value = true
    fakeProgress.value = 0 // Reset when starting upload
    const res = await uploadAudio(raw)
    const recordId = res?.data?.record_id
    
    if (recordId) {
      taskStore.addTask({
        record_id: recordId,
        filename: raw.name,
        status: res.data.status || 'pending',
        created_at: new Date().toLocaleString(),
        current_stage: '',
        progress: 0
      })
      ElMessage.success('上传成功，已加入处理队列')
      // Refresh recent records as we have a new task
      fetchDashboardThree()
    }
  } catch (e) {
    options.onError && options.onError(e)
    ElMessage.error(e?.message || '上传失败')
  } finally {
    isUploading.value = false
  }
}

const handleDelete = (row) => {
  const id = row.record_id
  if (!id) return

  const isProcessing = row.status === 'processing'
  const msg = isProcessing 
    ? '该任务正在进行中，删除将中断后台处理，确定吗？'
    : '确定要删除该任务吗？'

  ElMessageBox.confirm(
    msg,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      await deleteRecord(id)
      taskStore.removeTask(id)
      ElMessage.success('删除成功')
    } catch (e) {
      console.error(e)
    }
  }).catch(() => {})
}

const checkStatus = async () => {
  if (tasks.value.length === 0) return

  // Only poll tasks that are not final
  const activeTasks = tasks.value.filter(t => !['success', 'failed'].includes(t.status))
  
  if (activeTasks.length === 0) return

  for (const task of activeTasks) {
    try {
      const res = await getDetail(task.record_id)
      // Correctly read data structure: res.data.info or res.data
      const info = res?.data?.info || res?.data
      
      if (info) {
                taskStore.updateTask(task.record_id, {
          status: info.status,
          current_stage: info.current_stage || '',
          error_message: info.error_message || '',
          progress: info.progress || (info.status === 'success' ? 100 : 0)
        })
        // If task finished, refresh three stats
        if (['success', 'failed'].includes(info.status)) {
          fetchDashboardThree()
          fetchDashboardStats()
        }
      }
    } catch (e) {
      console.error(`Polling error for ${task.record_id}:`, e)
    }
  }
}

const fetchDashboardStats = async () => {
  try {
    const res = await getDashboardStats()
    if (res?.data) {
      stats.value = {
        total_transcribed: res.data.total_transcribed || 0,
        total_summarized: res.data.total_summarized || 0
      }
      uptime.value = {
        days: res.data.uptime_days || 0,
        hours: res.data.uptime_hours || 0
      }
    }
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
  }
}

const fetchAmbientAndHealth = async () => {
  const [ambRes, healthRes] = await Promise.allSettled([
    getDashboardAmbient(),
    getDashboardHealth()
  ])

  if (ambRes.status === 'fulfilled' && ambRes.value?.data) {
    const d = ambRes.value.data
    ambientData.value = {
      location: d.location ?? '未知地区',
      weather: d.weather ?? '无法获取',
      temperature: d.temperature ?? '--',
      uptime_days: d.uptime_days ?? '--',
      uptime_hours: d.uptime_hours ?? '--',
    }
  }

  if (healthRes.status === 'fulfilled' && healthRes.value?.data) {
    const d = healthRes.value.data
    healthData.value = {
      asr_online: !!d.asr_online,
      llm_online: !!d.llm_online,
    }
  }
}

// ─── 区块三：近期对话焦点 & 历史转录记录 ────────────────────────────────
const keywords = ref([])
const recentRecords = ref([])

const getStatusClass = (status) => {
  if (status === 'success') return 'bg-emerald-50/50 text-emerald-600/80 border-emerald-100'
  if (['processing', 'pending'].includes(status)) return 'bg-amber-50/50 text-amber-600/80 border-amber-100'
  if (status === 'failed') return 'bg-rose-50/50 text-rose-600/80 border-rose-100'
  return 'bg-slate-50/50 text-slate-600/80 border-slate-100'
}

const isNewRecord = (record) => {
  if (!record.upload_time) return false
  // 核心修复：后端传来的 ISO 字符串如果是 UTC 但没带 Z，JS 会误认。
  // 我们手动补上 Z 确保其作为绝对 UTC 时间解析
  let timeStr = record.upload_time
  if (!timeStr.includes('Z') && !timeStr.includes('+')) {
    timeStr += 'Z'
  }
  const uploadTime = new Date(timeStr).getTime()
  const now = Date.now()
  // 逻辑：最近 1 小时内上传的，或者本次会话开启后上传的
  return uploadTime > (now - 60 * 60 * 1000) || uploadTime > (sessionStartTime.value - 5000)
}

// ─── ECharts 词云实例与配置 ──────────────────────────────────────────────
const wordCloudRef = ref(null)
let wordCloudChart = null

const buildWordCloudOption = () => {
  const values = keywords.value.map(k => Number(k.value) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const colors = ['#000000', '#4e4e4e', '#777169']

  const data = keywords.value.map(item => {
    const val = Number(item.value) || 0
    const t = max === min ? 0.5 : (val - min) / (max - min)

    return {
      name: item.name,
      value: val,
      // 所有样式都放在局部 textStyle，避免全局/局部优先级冲突
      textStyle: {
        fontFamily: t > 0.5 ? 'Waldenburg, sans-serif' : 'Inter, sans-serif',
        fontWeight: t > 0.5 ? 300 : 400,
        color: colors[Math.floor(Math.random() * colors.length)]
      }
    }
  })

  return {
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center',
      top: 'center',
      width: '95%',
      height: '95%',
      sizeRange: [14, 48],
      rotationRange: [0, 0],
      gridSize: 8,
      drawOutOfBound: false,
      layoutAnimation: false,
      // 不写全局 textStyle：全部由 data 内部接管，杜绝优先级覆盖
      emphasis: { focus: 'none' },
      data
    }]
  }
}

const initWordCloud = () => {
  const el = wordCloudRef.value
  if (!el) return
  if (keywords.value.length === 0) return
  if (el.offsetWidth === 0 || el.offsetHeight === 0) return

  if (wordCloudChart) {
    wordCloudChart.dispose()
    wordCloudChart = null
  }
  wordCloudChart = echarts.init(el)
  wordCloudChart.setOption(buildWordCloudOption())
}

watch(keywords, () => {
  if (keywords.value.length > 0) {
    requestAnimationFrame(() => requestAnimationFrame(initWordCloud))
  }
}, { deep: true })

// 当容器因 grid 等高拉伸时，重新初始化词云以填满新尺寸
let wcResizeObserver = null
const setupWcResize = () => {
  const el = wordCloudRef.value
  if (!el || wcResizeObserver) return
  wcResizeObserver = new ResizeObserver(() => {
    if (keywords.value.length > 0 && el.offsetHeight > 0) {
      initWordCloud()
    }
  })
  wcResizeObserver.observe(el)
}

const handleResize = () => {
  wordCloudChart?.resize()
}

const fetchDashboardThree = async () => {
  try {
    const kRes = await getDashboardKeywords()
    if (kRes?.data) {
      // 过滤掉 spk0 和 spk1
      keywords.value = (kRes.data || []).filter(k => k.name !== 'spk0' && k.name !== 'spk1')
    }
  } catch (error) {
    console.error('Failed to load keywords:', error)
  }
  
  try {
    const rRes = await getDashboardRecentRecords()
    if (rRes?.data) recentRecords.value = rRes.data || []
  } catch (error) {
    console.error('Failed to load recent records:', error)
  }
}

const initDashboardData = async () => {
  isPageLoading.value = true
  
  // 并行执行所有初始化请求
  await Promise.allSettled([
    fetchDashboardStats(),
    fetchDashboardThree(),
    fetchAmbientAndHealth()
  ])
  
  // 模拟一个微小的延迟以增强转场视觉效果 (可选)
  setTimeout(() => {
    isPageLoading.value = false
  }, 400)
}

onMounted(() => {
  initDashboardData()
  // Restart polling if there are active tasks
  pollTimer = setInterval(checkStatus, 1000)
  checkStatus()
  window.addEventListener('resize', handleResize)
  setupWcResize()
  
  // Smooth fake progress ticker
  fakeProgressInterval = setInterval(() => {
    if (isUploading.value) {
      if (fakeProgress.value < 20) fakeProgress.value += 1
    } else if (activeTask.value) {
      if (activeTask.value.status === 'pending') {
        if (fakeProgress.value < 35) fakeProgress.value += 0.5
      } else if (activeTask.value.status === 'processing') {
        if (fakeProgress.value < 99) {
          // Slow down the increment as it gets closer to 99 to maintain patience
          const diff = 99 - fakeProgress.value
          const increment = Math.max(0.01, diff * 0.005) 
          fakeProgress.value += increment
        }
      } else if (activeTask.value.status === 'success') {
        fakeProgress.value = 100
      }
    } else {
      fakeProgress.value = 0
    }
  }, 100)
})

let isFirstLoad = true
onActivated(() => {
  if (isFirstLoad) {
    isFirstLoad = false
    return
  }
  // 静默刷新数据（不触发 isPageLoading 全屏遮罩）
  fetchDashboardStats()
  fetchDashboardThree()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (fakeProgressInterval) clearInterval(fakeProgressInterval)
  window.removeEventListener('resize', handleResize)
  wcResizeObserver?.disconnect()
  wordCloudChart?.dispose()
  wordCloudChart = null
})

const goDetail = (row) => {
  router.push(`/detail/${row.record_id}`)
}

const goTranscript = (row) => {
  const id = row.id || row.record_id
  router.push(`/transcript-check/${id}`)
}
</script>

<template>
  <div class="relative" :class="{ 'h-[calc(100vh-130px)] overflow-hidden': isPageLoading, 'min-h-[600px]': !isPageLoading }">
    <!-- 全屏加载覆盖层 -->
    <transition name="fade">
      <div v-if="isPageLoading" 
           class="absolute inset-0 z-[100] bg-[rgba(255,255,255,0.9)] backdrop-blur-md flex flex-col items-center justify-center rounded-[24px]">
        <div class="flex flex-col items-center -mt-20"> <!-- 向上微调，视觉上更居中 -->
          <div class="relative w-16 h-16 mb-8">
            <svg class="w-full h-full text-[#e5e5e5] animate-spin" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="70 200" stroke-linecap="round"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-3 h-3 bg-black rounded-full animate-pulse"></div>
            </div>
          </div>
          <h2 class="text-[20px] font-[300] tracking-[0.05em] text-black mb-2" style="font-family: 'Waldenburg', sans-serif;">加载工作台中，请稍等</h2>
          <p class="text-[13px] text-[#777169] tracking-[0.16px] animate-pulse">正在调度 Paraformer 与 Qwen 引擎...</p>
        </div>
      </div>
    </transition>

    <div class="flex flex-col gap-6" :class="{ 'opacity-0': isPageLoading, 'transition-opacity duration-1000': true }">

    <!-- 区块一：顶部环境舱 -->
    <DashboardStatusBar 
      class="animate-fade-in"
      style="animation-delay: 0.1s"
      :ambient-data="ambientData" 
      :health-data="healthData" 
      :loading="isPageLoading" 
    />

    <!-- ══ 区块二：数据面板与上传 ══ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- 左侧：数据速览 -->
      <div class="col-span-1 flex flex-col gap-6">
        <!-- 卡片 1 -->
        <div class="premium-card p-6 flex flex-col justify-between flex-1 animate-fade-in" style="animation-delay: 0.2s">
          <div v-if="isPageLoading" class="flex flex-col gap-4">
             <div class="flex justify-between items-center"><div class="w-24 h-4 skeleton-pulse rounded"></div><div class="w-10 h-10 skeleton-pulse rounded-full"></div></div>
             <div class="w-16 h-10 skeleton-pulse rounded mt-2"></div>
          </div>
          <template v-else>
            <div class="flex items-center justify-between">
              <span class="text-[14px] font-[400] text-[#777169] tracking-[0.16px]">累计转写音频</span>
              <div class="w-10 h-10 rounded-full bg-[#f6f6f6] flex items-center justify-center">
                 <svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
                 </svg>
              </div>
            </div>
            <p class="text-[40px] leading-none font-[300] tracking-[-0.96px] text-black mt-4" style="font-family: 'Waldenburg', sans-serif;">{{ stats.total_transcribed }}</p>
          </template>
        </div>

        <!-- 卡片 2 -->
        <div class="premium-card p-6 flex flex-col justify-between flex-1 animate-fade-in" style="animation-delay: 0.3s">
          <div v-if="isPageLoading" class="flex flex-col gap-4">
             <div class="flex justify-between items-center"><div class="w-24 h-4 skeleton-pulse rounded"></div><div class="w-10 h-10 skeleton-pulse rounded-full"></div></div>
             <div class="w-16 h-10 skeleton-pulse rounded mt-2"></div>
          </div>
          <template v-else>
            <div class="flex items-center justify-between">
              <span class="text-[14px] font-[400] text-[#777169] tracking-[0.16px]">深度总结生成</span>
              <div class="w-10 h-10 rounded-full bg-[#f6f6f6] flex items-center justify-center">
                 <svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                   <rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.8"/>
                   <rect x="9" y="9" width="6" height="6" rx="1" stroke-width="1.8"/>
                   <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" stroke-width="1.8" stroke-linecap="round"/>
                 </svg>
              </div>
            </div>
            <p class="text-[40px] leading-none font-[300] tracking-[-0.96px] text-black mt-4" style="font-family: 'Waldenburg', sans-serif;">{{ stats.total_summarized }}</p>
          </template>
        </div>

        <!-- 卡片 3 -->
        <div class="premium-card p-6 flex flex-col justify-between flex-1 animate-fade-in" style="animation-delay: 0.4s">
          <div v-if="isPageLoading" class="flex flex-col gap-4">
             <div class="flex justify-between items-center"><div class="w-24 h-4 skeleton-pulse rounded"></div><div class="w-10 h-10 skeleton-pulse rounded-full"></div></div>
             <div class="w-16 h-10 skeleton-pulse rounded mt-2"></div>
          </div>
          <template v-else>
            <div class="flex items-center justify-between">
              <span class="text-[14px] font-[400] text-[#777169] tracking-[0.16px]">系统运行时间</span>
              <div class="w-10 h-10 rounded-full bg-[#f6f6f6] flex items-center justify-center">
                 <svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                   <circle cx="12" cy="12" r="9" stroke-width="1.8"/>
                   <path d="M12 7v5l3 3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                 </svg>
              </div>
            </div>
            <p class="text-[40px] leading-none font-[300] tracking-[-0.96px] text-black mt-4" style="font-family: 'Waldenburg', sans-serif;">
              <template v-if="uptime.days > 0">
                {{ uptime.days }}<span class="text-[14px] font-[400] text-[#777169] ml-1 mr-2 align-baseline tracking-[0.16px]" style="font-family: 'Inter', sans-serif;">天</span>
              </template>
              {{ uptime.hours }}<span class="text-[14px] font-[400] text-[#777169] ml-1 align-baseline tracking-[0.16px]" style="font-family: 'Inter', sans-serif;">小时</span>
            </p>
          </template>
        </div>
      </div>

      <!-- 右侧：上传控制台 -->
      <div class="col-span-1 lg:col-span-2 premium-card p-8 flex flex-col relative overflow-hidden animate-fade-in" 
           style="background: linear-gradient(135deg, rgba(245, 242, 239, 0.5) 0%, rgba(240, 244, 248, 0.3) 100%); animation-delay: 0.5s;">
        
        <!-- Animated Waveform Background -->
        <div class="absolute inset-x-0 bottom-0 h-32 pointer-events-none overflow-hidden opacity-[0.08]">
          <div class="flex items-end justify-center gap-1.5 h-full px-4">
            <div v-for="i in 40" :key="i" 
                 class="w-1 bg-[#4e3217] rounded-full animate-wave-flow"
                 :style="{ 
                   height: Math.random() * 80 + 20 + '%', 
                   animationDelay: (i * 0.1) + 's',
                   animationDuration: (Math.random() * 1 + 1) + 's'
                 }">
            </div>
          </div>
        </div>

        <h3 class="text-[18px] font-[400] text-black mb-6 tracking-[0.16px] relative z-10">语音处理台</h3>

        <input ref="fileInput" type="file" accept="audio/*" class="hidden" @change="handleFileChange" />

        <!-- 状态 1：空闲上传 -->
        <div v-if="!isProcessing"
          class="flex-1 min-h-[260px] rounded-[16px] flex flex-col items-center justify-center cursor-pointer transition-colors group border border-dashed border-[#e5e5e5] relative z-10"
          :class="isDragging ? 'border-[#000000] bg-white shadow-card' : 'bg-transparent hover:bg-white/50'"
          @click="triggerFileInput" @dragover.prevent="handleDragOver" @dragleave.prevent="handleDragLeave" @drop.prevent="handleDrop">
          
          <div class="w-14 h-14 rounded-full bg-white shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px] flex items-center justify-center mb-5 text-[#4e4e4e] group-hover:text-black transition-colors">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
          </div>

          <p class="text-[16px] font-[300] tracking-[-0.3px] text-black mb-2" style="font-family: 'Waldenburg', sans-serif;">点击或拖拽音频文件至此</p>
          <p class="text-[13px] text-[#777169] tracking-[0.16px]">支持 WAV / MP3 / M4A 格式，单次最高支持 2 小时</p>

          <button type="button" 
                  class="mt-8 px-8 py-3 bg-[rgba(245,242,239,0.8)] shadow-[rgba(78,50,23,0.04)_0px_6px_16px] rounded-full text-[14px] font-medium text-black hover:bg-[#f5f2ef] transition-all hover:scale-[1.02] active:scale-[0.98] pointer-events-none select-none">
            选择文件
          </button>
        </div>

        <!-- 状态 2：处理中 -->
        <div v-else class="flex-1 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-[16px] p-8 shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px] relative z-10">
          <div class="relative w-12 h-12 flex items-center justify-center mb-4">
            <svg class="absolute inset-0 w-full h-full text-[#e5e5e5] animate-spin" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="80 200" stroke-linecap="round"/>
            </svg>
            <div class="w-2 h-2 bg-black rounded-full animate-pulse"></div>
          </div>
          
          <p class="text-[15px] font-[300] tracking-[-0.3px] text-black mt-2 mb-1" style="font-family: 'Waldenburg', sans-serif;">{{ currentStatusText }}</p>

          <div class="w-full max-w-sm mt-6">
            <div class="flex justify-between items-center mb-3">
              <span class="text-[12px] text-[#777169] tracking-[0.16px]">进度</span>
              <span class="text-[12px] font-medium text-black">{{ currentProgress }}%</span>
            </div>
            <div class="h-1 w-full bg-[#f5f5f5] rounded-full overflow-hidden">
              <div class="h-full bg-black transition-all duration-300 ease-out rounded-full" :style="{ width: currentProgress + '%' }"></div>
            </div>
            <p v-if="activeTask && activeTask.filename" class="text-[12px] text-[#777169] mt-4 text-center truncate tracking-[0.16px]">正在处理: {{ activeTask.filename }}</p>
          </div>
        </div>

      </div>
    </div>

    <!-- ══ 区块三：历史与词云 ══ -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full pb-6">
      
      <!-- 左：词云 -->
      <div class="premium-card p-6 flex flex-col animate-fade-in" style="animation-delay: 0.6s">
        <h3 class="text-[18px] font-[400] text-black tracking-[0.16px] mb-3">近期对话焦点</h3>
        <div style="flex:1;min-height:220px;background:#f6f6f6;border-radius:16px;position:relative;overflow:hidden;">
          <div v-show="keywords.length === 0"
               style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;color:#777169;">暂无重点数据</div>
          <div ref="wordCloudRef"
               :style="{ width: '100%', height: '100%', opacity: keywords.length ? 1 : 0 }"></div>
        </div>
      </div>

      <!-- 右：历史 -->
      <div class="premium-card p-6 flex flex-col animate-fade-in" style="animation-delay: 0.7s">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-[18px] font-[400] text-black tracking-[0.16px]">最新转录记录</h3>
          <button class="text-[13px] text-[#777169] hover:text-black hover:underline transition-colors bg-transparent border-none cursor-pointer p-0" @click="router.push('/history')">探索全部</button>
        </div>
        
        <div class="flex-1 flex flex-col pt-2">
          <template v-if="recentRecords.length === 0">
            <div class="flex-1 flex items-center justify-center text-[13px] text-[#777169] min-h-[150px] tracking-[0.16px]">暂无转录记录</div>
          </template>
          <template v-else>
            <div class="flex flex-col gap-1.5">
              <div v-for="record in recentRecords" :key="record.id"
                   class="flex justify-between items-center py-4 hover:bg-[#f6f6f6] px-4 -mx-4 rounded-[12px] cursor-pointer transition-all border border-transparent hover:border-[#e5e5e5]"
                   @click="goTranscript(record)">
                <div class="flex items-center min-w-0 relative">
                  <!-- New Badge (Based on upload_time) -->
                  <div v-if="isNewRecord(record)" class="absolute -left-2 -top-2 z-50">
                    <div class="new-badge">NEW</div>
                  </div>
                  
                  <div class="w-10 h-10 rounded-full bg-[#fcfbf9] flex items-center justify-center flex-shrink-0 border border-[#f0f0f0] shadow-sm">
                    <svg class="w-4 h-4 text-[#4e4e4e]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <div class="ml-4 flex flex-col min-w-0">
                    <!-- Top: Record Title -->
                    <span class="text-[15px] font-medium text-black truncate tracking-[-0.3px] mb-1">
                      {{ record.title || record.original_filename || `未命名记录 #${record.id}` }}
                    </span>
                    <!-- Bottom: Filename & Time -->
                    <div class="flex items-center gap-2">
                       <span v-if="record.title && record.original_filename" class="text-[11px] text-[#999] truncate tracking-[0.16px] max-w-[120px]" :title="record.original_filename">
                        {{ record.original_filename }}
                      </span>
                      <span v-if="record.title && record.original_filename" class="text-[10px] text-[#ccc]">•</span>
                      <span class="text-[11px] text-[#999] tracking-[0.16px]">{{ record.created_at || '刚才' }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex-shrink-0 ml-4">
                   <span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all" :class="getStatusClass(record.status)">
                     {{ record.status === 'success' ? '分析完成' : (record.status === 'failed' ? '分析失败' : (record.status_label || record.status)) }}
                   </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

    </div>
  </div>
</div>
</template>

<style scoped>
@keyframes wave-flow {
  0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
  50% { transform: scaleY(1); opacity: 1; }
}

.animate-wave-flow {
  animation: wave-flow 2s ease-in-out infinite;
}

@keyframes barberpole {
  to { background-position: 1rem 0; }
}

/* Dashboard 外层容器：flex 列布局，顶部对齐 */
.dashboard-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 32px;
  min-height: calc(100vh - 60px);
  gap: 0;
}

/* 渐变过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.new-badge {
  background: #000;
  color: #fff;
  font-size: 8px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 4px;
  transform: rotate(15deg);
  box-shadow: 0 0 0 2px #fff, 0 4px 10px rgba(0,0,0,0.3);
  letter-spacing: 0.02em;
  animation: badge-pulse 2s infinite;
}

@keyframes badge-pulse {
  0% { transform: rotate(15deg) scale(1); box-shadow: 0 0 0 2px #fff, 0 4px 10px rgba(0,0,0,0.3); }
  50% { transform: rotate(15deg) scale(1.1); box-shadow: 0 0 0 4px #fff, 0 6px 15px rgba(0,0,0,0.4); }
  100% { transform: rotate(15deg) scale(1); box-shadow: 0 0 0 2px #fff, 0 4px 10px rgba(0,0,0,0.3); }
}
</style>


