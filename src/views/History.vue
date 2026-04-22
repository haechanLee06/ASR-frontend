<script setup>
import { onMounted, ref, computed } from 'vue'
import request from '@/api/request'
import { deleteRecord, updateRecordTitle } from '@/api/audio'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Loading } from '@element-plus/icons-vue'

const rawData = ref([])
const loading = ref(true)
const selectedIds = ref(new Set())
const router = useRouter()

async function fetchHistory() {
  loading.value = true
  try {
    const res = await request.get('/history')
    rawData.value = res?.data || []
  } finally {
    // 微弱的延迟，展现骨架屏过渡效果
    setTimeout(() => {
      loading.value = false
    }, 400)
  }
}

onMounted(fetchHistory)

const isAllSelected = computed(() => rawData.value.length > 0 && selectedIds.value.size === rawData.value.length)
const isIndeterminate = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < rawData.value.length)

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value.clear()
  } else {
    rawData.value.forEach(row => {
      selectedIds.value.add(row.id || row.record_id)
    })
  }
}

function toggleRow(id) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

const showActionBar = computed(() => selectedIds.value.size > 0)
const isDeleting = ref(false)

async function handleBatchDelete() {
  if (selectedIds.value.size === 0) return
  isDeleting.value = true
  try {
    const ids = Array.from(selectedIds.value)
    await Promise.all(ids.map(id => deleteRecord(id)))
    ElMessage.success('记录清理完毕')
    selectedIds.value.clear()
    await fetchHistory()
  } catch (e) {
    console.error(e)
    ElMessage.error('清理异常')
    await fetchHistory()
  } finally {
    isDeleting.value = false
  }
}

async function handleDeleteRow(row) {
  const id = row?.id || row?.record_id
  if (!id) return
  
  ElMessageBox.confirm('这将会永久销毁此条转录记录及相关音频，是否继续？', '防误删确认', {
    confirmButtonText: '强制销毁',
    cancelButtonText: '保留',
    type: 'warning',
  }).then(async () => {
    try {
      await deleteRecord(id)
      ElMessage.success('已销毁')
      fetchHistory()
    } catch (e) {}
  }).catch(() => {})
}

function goDetail(row) {
  const id = row?.id || row?.record_id
  if (id) {
    router.push(`/detail/${id}`)
  }
}

async function handleEditTitle(row) {
  const id = row?.id || row?.record_id
  if (!id) return
  editingId.value = id
  editValue.value = row.title || ''
}

const editingId = ref(null)
const editValue = ref('')
const isSavingTitle = ref(false)

async function cancelEdit() {
  editingId.value = null
  editValue.value = ''
}

async function saveTitleEdit(row) {
  if (!editValue.value?.trim()) return
  const id = row.id || row.record_id
  isSavingTitle.value = true
  try {
    await updateRecordTitle(id, editValue.value.trim())
    ElMessage.success('名称已更新')
    editingId.value = null
    fetchHistory()
  } finally {
    isSavingTitle.value = false
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr.replace('T', ' ')
    const pad = (n) => n.toString().padStart(2, '0')
    const Y = d.getFullYear()
    const M = pad(d.getMonth() + 1)
    const D = pad(d.getDate())
    const h = pad(d.getHours())
    const m = pad(d.getMinutes())
    const s = pad(d.getSeconds())
    return `${Y}-${M}-${D} ${h}:${m}:${s}`
  } catch (e) {
    return dateStr.replace('T', ' ')
  }
}

const getStatusLabel = (status) => {
  if (!status) return '未知'
  const map = {
    pending: '排队进入序列',
    processing: '系统转写中',
    success: '已保存',
    failed: '解析失败'
  }
  return map[status] || status
}

const getStatusPillClass = (status) => {
  const base = 'px-3 py-1 rounded-full text-[11px] font-medium border'
  if (!status) return `${base} bg-slate-50 text-slate-600 border-slate-200/60 shadow-xs-inset`
  const s = String(status).toLowerCase()
  if (s === 'success' || s.includes('完成')) {
    return `${base} bg-emerald-50 text-emerald-700 border-emerald-200/60 shadow-xs-inset`
  }
  if (s === 'failed' || s.includes('fail') || s.includes('error') || s.includes('失败')) {
    return `${base} bg-rose-50 text-rose-700 border-rose-200/60 shadow-xs-inset`
  }
  if (s === 'processing' || s === 'pending' || s.includes('loading') || s.includes('处理中')) {
    return `${base} bg-[#fcf9f5] text-[#8c6b45] border-[#e8dccb] shadow-xs-inset`
  }
  return `${base} bg-slate-50 text-slate-600 border-slate-200/60 shadow-xs-inset`
}
</script>

<template>
  <div class="relative min-h-[600px] flex flex-col pt-2 pb-24">
    <!-- Header -->
    <div class="flex justify-between items-end mb-8 px-2">
      <div>
        <h1 class="text-[32px] font-[300] tracking-[-0.96px] text-[#000000] mb-1" style="font-family: 'Waldenburg', sans-serif;">所有记录</h1>
        <p class="text-[14px] text-[#777169] tracking-[0.16px]">管理与回顾过去的语音处理记录</p>
      </div>
      
      <button @click="fetchHistory" class="flex items-center gap-2 text-[13px] text-[#777169] hover:text-black transition-colors rounded-full px-4 py-2 hover:bg-[#f5f5f5]">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11A8.1 8.1 0 004.5 9M4 22v-6h6M4 13a8.1 8.1 0 0015.5 2m.5 6v-6h-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>刷新列表</span>
      </button>
    </div>

    <!-- Table Container -->
    <div class="bg-white rounded-[24px] shadow-[rgba(0,0,0,0.06)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_1px_2px,rgba(0,0,0,0.04)_0px_2px_4px] overflow-x-auto relative">
      <div class="min-w-[808px]">
        <!-- Custom Header Row -->
        <div class="grid grid-cols-[64px_minmax(150px,1fr)_minmax(150px,1fr)_100px_120px_160px_110px] items-center px-4 py-4 border-b border-[#e5e5e5] bg-[#fdfdfd]">
          <div class="flex items-center justify-center">
             <input type="checkbox" :checked="isAllSelected" :data-indeterminate="isIndeterminate" @change="toggleSelectAll" class="minimal-checkbox" />
          </div>
          <span class="text-[12px] font-medium text-[#777169] tracking-[0.16px] uppercase">Record Name</span>
          <span class="text-[12px] font-medium text-[#777169] tracking-[0.16px] uppercase">File Name</span>
          <span class="text-[12px] font-medium text-[#777169] tracking-[0.16px] uppercase text-center">Duration</span>
          <span class="text-[12px] font-medium text-[#777169] tracking-[0.16px] uppercase text-center">Status</span>
          <span class="text-[12px] font-medium text-[#777169] tracking-[0.16px] uppercase">Upload Date</span>
          <span class="text-[12px] font-medium text-[#777169] tracking-[0.16px] uppercase text-right mr-6">Actions</span>
        </div>

        <!-- Loading Skeleton -->
        <transition name="fade" mode="out-in">
          <div v-if="loading" class="flex flex-col">
            <div v-for="i in 5" :key="i" class="grid grid-cols-[64px_minmax(150px,1fr)_minmax(150px,1fr)_100px_120px_160px_110px] items-center px-4 py-5 border-b border-[#f5f5f5] last:border-0">
              <div class="flex justify-center"><div class="w-4 h-4 rounded-[4px] bg-[#f5f5f5] animate-pulse"></div></div>
              <div class="pr-4"><div class="h-4 bg-[#f5f5f5] rounded block w-3/4 animate-pulse"></div></div>
              <div class="pr-6"><div class="h-4 bg-[#f5f5f5] rounded block w-3/4 animate-pulse"></div></div>
              <div class="flex justify-center"><div class="h-4 bg-[#f5f5f5] rounded block w-12 animate-pulse"></div></div>
              <div class="flex justify-center"><div class="h-6 bg-[#f5f5f5] rounded-full block w-16 animate-pulse"></div></div>
              <div><div class="h-4 bg-[#f5f5f5] rounded block w-24 animate-pulse"></div></div>
              <div class="flex justify-end gap-2 pr-6"><div class="h-4 bg-[#f5f5f5] rounded block w-12 animate-pulse"></div></div>
            </div>
          </div>

          <div v-else-if="rawData.length === 0" class="flex flex-col items-center justify-center py-24">
            <svg class="w-12 h-12 text-[#e5e5e5] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/></svg>
            <span class="text-[14px] text-[#777169] tracking-[0.16px]">深空宁静，暂无任何记录</span>
          </div>

          <!-- Data Rows -->
          <div v-else class="flex flex-col">
            <div v-for="row in rawData" :key="row.id || row.record_id" 
                 class="grid grid-cols-[64px_minmax(150px,1fr)_minmax(150px,1fr)_100px_120px_160px_110px] items-center px-4 py-4 border-b border-[#f5f5f5] last:border-0 hover:bg-[#fcfbf9] transition-colors group cursor-pointer"
                 @click.self="goDetail(row)">
                 
              <!-- Checkbox -->
              <div class="flex items-center justify-center relative">
                <div class="absolute inset-0 cursor-pointer" @click.stop="toggleRow(row.id || row.record_id)"></div>
                <input type="checkbox" :checked="selectedIds.has(row.id || row.record_id)" class="minimal-checkbox pointer-events-none" />
              </div>

              <!-- RecordTitle -->
              <div class="pr-4 flex flex-col min-w-0" @click="goDetail(row)">
                <div v-if="editingId === (row.id || row.record_id)" class="flex items-center gap-2" @click.stop>
                  <input v-model="editValue" class="edit-input" @keyup.enter="saveTitleEdit(row)" @keyup.esc="cancelEdit" autofocus />
                  <div class="flex gap-1">
                    <button class="mini-action-btn btn-confirm" @click="saveTitleEdit(row)" :disabled="isSavingTitle">
                      <el-icon v-if="!isSavingTitle"><Check /></el-icon>
                      <el-icon v-else class="is-loading"><Loading /></el-icon>
                    </button>
                    <button class="mini-action-btn btn-cancel" @click="cancelEdit" :disabled="isSavingTitle">
                      <el-icon><Close /></el-icon>
                    </button>
                  </div>
                </div>
                <div v-else class="flex items-center gap-2 group/title">
                  <span class="text-[15px] font-medium text-black truncate tracking-[-0.3px]">
                    {{ row.title || `未命名记录 #${row.id || row.record_id}` }}
                  </span>
                  <button @click.stop="handleEditTitle(row)" class="opacity-0 group-hover/title:opacity-100 p-1 hover:bg-[#f3f0ec] rounded transition-all">
                    <svg class="w-3.5 h-3.5 text-[#777169]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </div>

              <!-- FileName -->
              <div class="pr-6 flex flex-col min-w-0" @click="goDetail(row)">
                <span class="text-[13px] text-[#777169] truncate tracking-[-0.1px]">{{ row.original_filename || row.filename }}</span>
              </div>

              <!-- Duration -->
              <div class="flex justify-center text-[13px] text-[#777169] font-medium tracking-[0.16px]" style="font-family: 'Inter', sans-serif;" @click="goDetail(row)">
                {{ row.duration || '--' }}
              </div>

              <!-- Status Pill -->
              <div class="flex justify-center" @click="goDetail(row)">
                <span :class="getStatusPillClass(row.status)">{{ getStatusLabel(row.status) }}</span>
              </div>

              <!-- Date -->
              <div class="text-[13px] text-[#777169] tracking-[0.16px]" style="font-family: 'Inter', sans-serif;" @click="goDetail(row)">
                {{ formatDate(row.upload_time || row.created_at) }}
              </div>

              <!-- Actions -->
              <div class="flex justify-end gap-3 transition-opacity relative items-center pr-2">
                <button @click.stop="goDetail(row)" class="text-[12px] font-medium text-[#777169] hover:text-black hover:underline transition-colors tracking-[0.16px]">核阅</button>
                <div class="w-px h-3 bg-[#e5e5e5]"></div>
                <button @click.stop="handleDeleteRow(row)" class="text-[12px] font-medium text-rose-500/80 hover:text-rose-600 hover:underline transition-colors tracking-[0.16px]">删除</button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Floating Batch Action Bar -->
    <transition name="slide-up">
      <div v-if="showActionBar" 
           class="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[rgba(255,255,255,0.85)] backdrop-blur-xl border border-[#e5e5e5] rounded-full px-6 py-3 flex items-center gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] z-50 transition-all">
        <div class="flex items-center gap-2">
           <div class="w-6 h-6 rounded-full bg-[#f5f2ef] flex items-center justify-center text-black font-semibold text-[13px]">
             {{ selectedIds.size }}
           </div>
           <span class="text-[14px] font-medium text-black tracking-[0.16px]">项已选定</span>
        </div>
        <div class="w-px h-5 bg-[#e5e5e5]"></div>
        <button @click="handleBatchDelete" 
                class="flex items-center gap-1.5 text-[14px] font-medium text-rose-600 hover:text-rose-700 transition-colors"
                :class="{ 'opacity-50 cursor-not-allowed': isDeleting }">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {{ isDeleting ? '清理中...' : '销毁选定记录' }}
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.minimal-checkbox {
  appearance: none;
  width: 16px;
  height: 16px;
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  background-color: transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  margin: 0;
}

.minimal-checkbox:hover {
  border-color: #000000;
}

.minimal-checkbox:checked {
  background-color: #000000;
  border-color: #000000;
}

.minimal-checkbox:checked::after {
  content: '';
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(45deg);
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 1.5px 1.5px 0;
}

/* Semi-selected state styling */
.minimal-checkbox[data-indeterminate="true"] {
  background-color: #000000;
  border-color: #000000;
}
.minimal-checkbox[data-indeterminate="true"]::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 1.5px;
  background-color: white;
  border: none;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}

.edit-input {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 14px;
  outline: none;
  width: 100%;
}
.edit-input:focus {
  border-color: #000;
  background: #fff;
}

.mini-action-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}
.mini-action-btn.btn-confirm { background: #000; color: #fff; }
.mini-action-btn.btn-cancel { background: #f0f0f0; color: #666; }
.mini-action-btn:hover { transform: scale(1.1); }
</style>
