<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadAudio, getDetail, deleteRecord, getDashboardStats, getDashboardKeywords, getDashboardRecentRecords, getDashboardAmbient } from '@/api/audio'
import { useRouter } from 'vue-router'
import { UploadFilled, View, Loading, Delete } from '@element-plus/icons-vue'
import DashboardStatusBar from '@/components/DashboardStatusBar.vue'
import * as echarts from 'echarts';
import 'echarts-wordcloud';

const router = useRouter()
const taskStore = useTaskStore()
const { tasks } = storeToRefs(taskStore)
let pollTimer = null

// ─── 区块二：数据速览 & 文件上传 ────────────────────────────────────────────
const stats = ref({ total_transcribed: 0, total_summarized: 0 })
const uptime = ref({ days: 0, hours: 0 })
const fileInput = ref(null)
const isUploading = ref(false)
const isDragging = ref(false)

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
    }
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
  }

  try {
    const ambRes = await getDashboardAmbient()
    if (ambRes?.data) {
      uptime.value = {
        days: ambRes.data.uptime_days || 0,
        hours: ambRes.data.uptime_hours || 0
      }
    }
  } catch (error) {
    console.error('Failed to load dashboard ambient info:', error)
  }
}

// ─── 区块三：近期对话焦点 & 历史转录记录 ────────────────────────────────
const keywords = ref([])
const recentRecords = ref([])

const getStatusClass = (status) => {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
  if (['processing', 'pending'].includes(status)) return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20'
  if (status === 'failed') return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20'
  return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20'
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

onMounted(() => {
  fetchDashboardStats()
  fetchDashboardThree()
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
  <div class="flex flex-col gap-6">

    <!-- 区块一：顶部环境舱 -->
    <DashboardStatusBar />

    <!-- ══ 区块二：数据面板与上传 ══ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- 左侧：数据速览 -->
      <div class="col-span-1 flex flex-col gap-6">
        <!-- 卡片 1 -->
        <div class="bg-white rounded-[24px] shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px,rgba(0,0,0,0.04)_0px_2px_4px] p-6 flex flex-col justify-between flex-1 transition-shadow hover:shadow-subtle-elevate cursor-default">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-[400] text-[#777169] tracking-[0.16px]">累计转写音频</span>
            <div class="w-10 h-10 rounded-full bg-[#f6f6f6] flex items-center justify-center">
               <svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
               </svg>
            </div>
          </div>
          <p class="text-[40px] leading-none font-[300] tracking-[-0.96px] text-black mt-4" style="font-family: 'Waldenburg', sans-serif;">{{ stats.total_transcribed }}</p>
        </div>

        <!-- 卡片 2 -->
        <div class="bg-white rounded-[24px] shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px,rgba(0,0,0,0.04)_0px_2px_4px] p-6 flex flex-col justify-between flex-1 transition-shadow hover:shadow-subtle-elevate cursor-default">
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
        </div>

        <!-- 卡片 3 -->
        <div class="bg-white rounded-[24px] shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px,rgba(0,0,0,0.04)_0px_2px_4px] p-6 flex flex-col justify-between flex-1 transition-shadow hover:shadow-subtle-elevate cursor-default">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-[400] text-[#777169] tracking-[0.16px]">系统运行时间</span>
            <div class="w-10 h-10 rounded-full bg-[#f6f6f6] flex items-center justify-center">
               <svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <circle cx="12" cy="12" r="9" stroke-width="1.8"/>
                 <path d="M12 7v5l3 3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
            </div>
          </div>
          <p class="text-[40px] leading-none font-[300] tracking-[-0.96px] text-black mt-4 border-b-0" style="font-family: 'Waldenburg', sans-serif;">
            <template v-if="uptime.days > 0">
              {{ uptime.days }}<span class="text-[14px] font-[400] text-[#777169] ml-1 mr-2 align-baseline tracking-[0.16px]" style="font-family: 'Inter', sans-serif;">天</span>
            </template>
            {{ uptime.hours }}<span class="text-[14px] font-[400] text-[#777169] ml-1 align-baseline tracking-[0.16px]" style="font-family: 'Inter', sans-serif;">小时</span>
          </p>
        </div>
      </div>

      <!-- 右侧：上传控制台 -->
      <div class="col-span-1 lg:col-span-2 rounded-[24px] p-8 flex flex-col transition-shadow hover:shadow-subtle-elevate relative overflow-hidden" 
           style="background: linear-gradient(135deg, rgba(245, 242, 239, 0.5) 0%, rgba(240, 244, 248, 0.3) 100%); box-shadow: rgba(0,0,0,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 1px 2px, rgba(0,0,0,0.04) 0px 2px 4px;">
        
        <!-- Waveform Background Pattern -->
        <div class="absolute inset-x-0 bottom-0 h-32 opacity-[0.03] pointer-events-none" 
             style="background-image: repeating-linear-gradient(90deg, #4e3217 0, #4e3217 1px, transparent 1px, transparent 8px); mask-image: linear-gradient(to top, black, transparent);"></div>

        <h3 class="text-[18px] font-[400] text-black mb-6 tracking-[0.16px] relative z-10">语音案卷处理台</h3>

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
      <div class="bg-white rounded-[24px] shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px,rgba(0,0,0,0.04)_0px_2px_4px] p-6 flex flex-col transition-shadow hover:shadow-subtle-elevate">
        <h3 class="text-[18px] font-[400] text-black tracking-[0.16px] mb-3">近期对话焦点</h3>
        <div style="flex:1;min-height:220px;background:#f6f6f6;border-radius:16px;position:relative;overflow:hidden;">
          <div v-show="keywords.length === 0"
               style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;color:#777169;">暂无重点数据</div>
          <div ref="wordCloudRef"
               :style="{ width: '100%', height: '100%', opacity: keywords.length ? 1 : 0 }"></div>
        </div>
      </div>

      <!-- 右：历史 -->
      <div class="bg-white rounded-[24px] shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px,rgba(0,0,0,0.04)_0px_2px_4px] p-6 flex flex-col transition-shadow hover:shadow-subtle-elevate">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-[18px] font-[400] text-black tracking-[0.16px]">最新转录卷宗</h3>
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
                <div class="flex items-center min-w-0">
                  <div class="w-10 h-10 rounded-full bg-[#f6f6f6] flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-[#4e4e4e]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <div class="ml-4 flex flex-col min-w-0">
                    <span class="text-[15px] font-medium text-black truncate tracking-[-0.3px]">{{ record.title }}</span>
                    <span class="text-[12px] text-[#777169] mt-1.5 truncate tracking-[0.16px]">{{ record.created_at }}</span>
                  </div>
                </div>
                <div class="flex-shrink-0 ml-4">
                   <span class="px-3 py-1 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-full text-[11px] font-medium text-black border border-[#e5e5e5]">
                     {{ record.status_label || record.status }}
                   </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
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
</style>


