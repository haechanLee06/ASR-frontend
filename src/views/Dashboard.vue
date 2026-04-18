<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadAudio, getDetail, deleteRecord, getDashboardStats, getDashboardKeywords, getDashboardRecentRecords } from '@/api/audio'
import { useRouter } from 'vue-router'
import { UploadFilled, View, Loading, Delete } from '@element-plus/icons-vue'
import DashboardStatusBar from '@/components/DashboardStatusBar.vue'

const router = useRouter()
const taskStore = useTaskStore()
const { tasks } = storeToRefs(taskStore)
let pollTimer = null

// ─── 区块二：数据速览 & 文件上传 ────────────────────────────────────────────
const stats = ref({ total_transcribed: 0, total_summarized: 0, uptime_hours: 0 })
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
        total_summarized: res.data.total_summarized || 0,
        uptime_hours: res.data.uptime_hours || 0
      }
    }
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
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

const fetchDashboardThree = async () => {
  try {
    const kRes = await getDashboardKeywords()
    if (kRes?.data) keywords.value = kRes.data || []
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
  checkStatus() // Immediate check
  
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

    <!-- ══ 区块二：数据板块与上传 ══ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- 左侧：数据速览 -->
      <div class="col-span-1 flex flex-col gap-6">
        <!-- 卡片 1 -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col justify-between flex-1 transition-shadow hover:shadow-md cursor-default">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium text-slate-500">累计转写音频</span>
            <div class="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
               <svg class="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
               </svg>
            </div>
          </div>
          <p class="text-3xl font-semibold text-slate-900 mt-4">{{ stats.total_transcribed }}</p>
        </div>

        <!-- 卡片 2 -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col justify-between flex-1 transition-shadow hover:shadow-md cursor-default">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium text-slate-500">深度总结生成</span>
            <div class="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
               <svg class="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.8"/>
                 <rect x="9" y="9" width="6" height="6" rx="1" stroke-width="1.8"/>
                 <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" stroke-width="1.8" stroke-linecap="round"/>
               </svg>
            </div>
          </div>
          <p class="text-3xl font-semibold text-slate-900 mt-4">{{ stats.total_summarized }}</p>
        </div>

        <!-- 卡片 3 -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col justify-between flex-1 transition-shadow hover:shadow-md cursor-default">
          <div class="flex items-center justify-between">
            <span class="text-[14px] font-medium text-slate-500">系统运行时间</span>
            <div class="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
               <svg class="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <circle cx="12" cy="12" r="9" stroke-width="1.8"/>
                 <path d="M12 7v5l3 3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
            </div>
          </div>
          <p class="text-3xl font-semibold text-slate-900 mt-4">
            {{ stats.uptime_hours }}<span class="text-[14px] font-medium text-slate-500 ml-1.5 align-baseline">小时</span>
          </p>
        </div>
      </div>

      <!-- 右侧：上传控制台 -->
      <div class="col-span-1 lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col transition-shadow hover:shadow-md">
        <h3 class="text-[16px] font-semibold text-slate-900 mb-6">语音案卷处理台</h3>

        <input ref="fileInput" type="file" accept="audio/*" class="hidden" @change="handleFileChange" />

        <!-- 状态 1：空闲上传 -->
        <div v-if="!isProcessing"
          class="flex-1 min-h-[220px] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors group border-2 border-dashed"
          :class="isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400'"
          @click="triggerFileInput" @dragover.prevent="handleDragOver" @dragleave.prevent="handleDragLeave" @drop.prevent="handleDrop">
          
          <div class="w-14 h-14 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5 text-slate-400 group-hover:text-indigo-600 transition-colors">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
          </div>

          <p class="text-[15px] font-semibold text-slate-900 mb-1">点击或拖拽音频文件至此</p>
          <p class="text-[13px] font-medium text-slate-500">支持 WAV / MP3 / M4A 格式，单次最高支持 2 小时</p>

          <button type="button" class="mt-8 px-5 py-2.5 bg-white border border-slate-200 shadow-sm rounded-lg text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors pointer-events-none select-none">
            选择文件
          </button>
        </div>

        <!-- 状态 2：处理中 -->
        <div v-else class="flex-1 flex flex-col items-center justify-center bg-slate-50/50 border border-slate-200 rounded-xl p-8">
          <div class="relative w-12 h-12 flex items-center justify-center mb-3">
            <svg class="absolute inset-0 w-full h-full text-indigo-500/20 animate-spin" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="80 200" stroke-linecap="round"/>
            </svg>
            <svg class="w-5 h-5 text-indigo-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20M17 5v14M7 5v14M22 10v4M2 10v4"/>
            </svg>
          </div>
          
          <p class="text-[15px] font-semibold text-slate-900 mt-2 mb-1">{{ currentStatusText }}</p>

          <div class="w-full max-w-sm mt-5">
            <div class="flex justify-between items-center mb-2">
              <span class="text-[13px] font-medium text-slate-600">进度</span>
              <span class="text-[13px] font-semibold text-indigo-600">{{ currentProgress }}%</span>
            </div>
            <div class="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-indigo-600 transition-all duration-300 ease-out rounded-full" :style="{ width: currentProgress + '%' }"></div>
            </div>
            <p v-if="activeTask && activeTask.filename" class="text-[12px] font-medium text-slate-500 mt-3 text-center truncate">正在处理: {{ activeTask.filename }}</p>
          </div>
        </div>

      </div>
    </div>

    <!-- ══ 区块三：历史与词云 ══ -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full pb-6">
      
      <!-- 左：词云 -->
      <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col transition-shadow hover:shadow-md">
        <h3 class="text-[16px] font-semibold text-slate-900 mb-4">近期对话焦点</h3>
        <div class="flex flex-wrap justify-center items-center gap-2 p-6 bg-slate-50/50 rounded-lg min-h-[220px] flex-1 border border-slate-100">
          <template v-if="keywords.length === 0">
            <span class="text-[13px] font-medium text-slate-500">暂无重点数据</span>
          </template>
          <template v-else>
            <span v-for="(kw, index) in keywords" :key="index"
                  class="px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm transition-colors cursor-default"
                  :class="index % 2 === 0 ? 'text-indigo-700 font-medium' : 'text-slate-700 font-medium'"
                  :style="{ fontSize: Math.max(12, Math.min(16, kw.value/4 + 11)) + 'px' }">
              {{ kw.name }}
            </span>
          </template>
        </div>
      </div>

      <!-- 右：历史 -->
      <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col transition-shadow hover:shadow-md">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-[16px] font-semibold text-slate-900">最新转录</h3>
          <button class="text-[13px] text-indigo-600 hover:text-indigo-700 font-medium transition-colors bg-transparent border-none cursor-pointer p-0" @click="router.push('/history')">全部</button>
        </div>
        
        <div class="flex-1 flex flex-col">
          <template v-if="recentRecords.length === 0">
            <div class="flex-1 flex items-center justify-center text-[13px] font-medium text-slate-500 min-h-[150px]">暂无转录记录</div>
          </template>
          <template v-else>
            <div class="flex flex-col">
              <div v-for="record in recentRecords" :key="record.id"
                   class="flex justify-between items-center py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-3 -mx-3 rounded-lg cursor-pointer transition-colors"
                   @click="goTranscript(record)">
                <div class="flex items-center min-w-0">
                  <div class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <div class="ml-3 flex flex-col min-w-0">
                    <span class="text-[14px] font-medium text-slate-900 truncate">{{ record.title }}</span>
                    <span class="text-[12px] font-medium text-slate-500 mt-0.5 truncate">{{ record.created_at }}</span>
                  </div>
                </div>
                <div class="flex-shrink-0 ml-3">
                   <span class="px-2 py-0.5 rounded-md text-[11px] font-medium" :class="getStatusClass(record.status)">
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


