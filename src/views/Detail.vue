<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getDetail, updateSegmentText, updateSegmentSpeaker, splitSegment, updateRecordTitle } from '@/api/audio'
import { VideoPlay, VideoPause, ArrowLeft, Loading, Edit, Switch, Scissor, Check, Close } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import WaveformPlayer from '@/components/WaveformPlayer.vue'

const route = useRoute()
const router = useRouter()
const info = ref({ segments: [] })
const currentId = ref(0)
const chatPanelRef = ref(null)

// State for async processing
const recordStatus = ref('loading') // loading, polling, success, failed
const errorMsg = ref('')
let pollTimer = null

// Computed for current segment
const currentSegment = computed(() => {
  if (info.value.segments && info.value.segments[currentId.value]) {
    return info.value.segments[currentId.value]
  }
  return null
})

const getAudioUrl = (path) => {
  const p = path || ''
  return p ? `http://localhost:5000/${String(p).replace(/^\//, '')}` : ''
}

// Watch currentId to scroll
watch(currentId, (newVal) => {
  scrollToBubble(newVal)
})

const scrollToBubble = (index) => {
  nextTick(() => {
    const el = document.getElementById(`bubble-${index}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

// Player state
const isPlaying = ref(false)
const currentPlayingId = ref(null)
const currentTime = ref(0)
const duration = ref(0)

const playerRefs = ref({})
const setPlayerRef = (el, id) => {
  if (el) {
    playerRefs.value[id] = el
  }
}

const onTimeUpdate = (time) => {
  currentTime.value = time
}

const onPlayerReady = (d) => {
  duration.value = d
}

const togglePlay = async (segment) => {
  if (!segment) return
  const index = info.value.segments.findIndex(s => s.id === segment.id)
  if (index !== -1) currentId.value = index

  if (currentPlayingId.value === segment.id) {
    isPlaying.value = !isPlaying.value
    return
  }

  if (currentPlayingId.value && playerRefs.value[currentPlayingId.value]) {
    playerRefs.value[currentPlayingId.value].reset()
  }

  currentPlayingId.value = segment.id
  currentTime.value = 0
  isPlaying.value = true
}

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const formatTime = (seconds) => {
  if (seconds === undefined || seconds === null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
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

const fetchDetail = async () => {
  try {
    const res = await getDetail(route.params.id)
    const data = res?.data || {}
    const status = data.status || 'success' 
    
    if (status === 'success') {
      const segs = (data.segments || []).map(s => ({
        ...s,
        playbackRate: 1.0,
        isEditing: false,
        isSaving: false
      }))
      info.value = { ...data.info, segments: segs }
      if (segs.length > 0 && currentId.value === 0) currentId.value = 0
      recordStatus.value = 'success'
      stopPolling()
    } else if (status === 'failed') {
      recordStatus.value = 'failed'
      errorMsg.value = data.error_message || '任务处理失败'
      stopPolling()
    } else {
      recordStatus.value = 'polling'
      if (!pollTimer) pollTimer = setInterval(fetchDetail, 2000)
    }
  } catch (e) {
    recordStatus.value = 'failed'
    errorMsg.value = e.message || '获取详情失败'
    stopPolling()
  }
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const fetchRecordInfo = async () => {
  try {
    const res = await getDetail(route.params.id)
    if (res?.data?.info) {
      const newInfo = res.data.info
      info.value.updated_at = newInfo.updated_at
      info.value.title = newInfo.title
    }
  } catch (e) { console.error('Refresh metadata failed', e) }
}

// Segment actions
const editSegment = (item) => {
  item.isEditing = true
  item.editText = item.text
}

const cancelEdit = (item) => { item.isEditing = false }

const saveEdit = async (item, index) => {
  if (!item.editText?.trim()) {
    ElMessage.warning('文本不能为空')
    return
  }
  item.isSaving = true
  try {
    await updateSegmentText(route.params.id, index, item.editText)
    item.text = item.editText
    item.isEditing = false
    ElMessage.success('修改已保存')
    await fetchRecordInfo() 
  } finally {
    item.isSaving = false
  }
}

const handleSwitchSpeaker = async (item, index) => {
  if (item.isSaving) return
  const newSpk = item.spk === 'spk0' ? 'spk1' : 'spk0'
  item.isSaving = true
  try {
    await updateSegmentSpeaker(route.params.id, index, newSpk)
    item.spk = newSpk
    ElMessage.success('角色已切换')
    await fetchRecordInfo()
  } finally {
    item.isSaving = false
  }
}

// Custom Confirm logic
const confirmDialog = ref({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  onConfirm: null
})

const showConfirm = (title, message, confirmText, onConfirm) => {
  confirmDialog.value = { visible: true, title, message, confirmText, onConfirm }
}

const handleConfirm = async () => {
  if (confirmDialog.value.onConfirm) {
    await confirmDialog.value.onConfirm()
  }
  confirmDialog.value.visible = false
}

const handleSplitSegment = async (item, index) => {
  const player = playerRefs.value[item.id]
  const offset = player ? player.getCurrentTime() : 0
  if (offset <= 0 || offset >= (item.end - item.start)) {
    ElMessage.warning('请通过波形图选择切分位置')
    return
  }
  
  showConfirm('切分对话', `确定要在 ${formatDuration(offset)} 处切分吗？`, '确认切分', async () => {
    recordStatus.value = 'polling'
    try {
      await splitSegment(route.params.id, index, offset)
      ElMessage.success('切分请求已提交')
      await fetchDetail() 
    } catch (e) {
      ElMessage.error('切分失败')
      recordStatus.value = 'success'
    }
  })
}

// Title editing
const isEditingTitle = ref(false)
const titleInput = ref('')
const isSavingTitle = ref(false)
const editTitle = () => {
  titleInput.value = info.value.title || '未命名记录'
  isEditingTitle.value = true
}
const cancelEditTitle = () => { isEditingTitle.value = false }
const saveTitle = async () => {
  if (!titleInput.value?.trim()) return
  isSavingTitle.value = true
  try {
    await updateRecordTitle(route.params.id, titleInput.value)
    info.value.title = titleInput.value
    isEditingTitle.value = false
    ElMessage.success('名称已更新')
    await fetchRecordInfo()
  } finally { isSavingTitle.value = false }
}

onMounted(fetchDetail)
onUnmounted(stopPolling)
</script>

<template>
  <div class="page-container detail-page-wrapper">
    <!-- Header -->
    <header class="detail-header animate-fade-in" style="animation-delay: 0.1s">
      <div class="header-left">
        <el-button class="back-btn" circle :icon="ArrowLeft" @click="router.push('/history')" />
        <div class="title-container" v-if="recordStatus === 'success'">
          <div v-if="!isEditingTitle" class="title-display" @click="editTitle">
            <h1 class="record-title">{{ info.title || `未命名记录 #${info.id}` }}</h1>
            <el-icon class="title-edit-icon"><Edit /></el-icon>
          </div>
          <div v-else class="title-edit-form">
            <el-input v-model="titleInput" size="large" class="title-input" @keyup.enter="saveTitle" />
            <div class="title-actions">
              <button class="action-btn-custom btn-confirm" @click="saveTitle" :disabled="isSavingTitle">
                <el-icon v-if="!isSavingTitle"><Check /></el-icon>
                <el-icon v-else class="is-loading"><Loading /></el-icon>
              </button>
              <button class="action-btn-custom btn-cancel" @click="cancelEditTitle" :disabled="isSavingTitle">
                <el-icon><Close /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="header-right" v-if="recordStatus === 'success'">
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">编号</span><span class="meta-value">#{{ route.params.id }}</span></div>
          <div class="meta-divider"></div>
          <div class="meta-item"><span class="meta-label">文件名</span><span class="meta-value truncate max-w-[120px]">{{ info.original_filename }}</span></div>
          <div class="meta-divider"></div>
          <div class="meta-item"><span class="meta-label">上传时间</span><span class="meta-value">{{ formatDate(info.upload_time) }}</span></div>
          <div class="meta-divider"></div>
          <div class="meta-item"><span class="meta-label">最后更新</span><span class="meta-value">{{ formatDate(info.updated_at || info.upload_time) }}</span></div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="detail-main-content">
      <div v-if="recordStatus === 'loading' || recordStatus === 'polling'" class="full-state">
        <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        <p>{{ recordStatus === 'loading' ? '加载中...' : 'AI 正在处理音频...' }}</p>
      </div>
      <div v-else-if="recordStatus === 'failed'" class="full-state">
        <el-result icon="error" title="分析失败" :sub-title="errorMsg">
          <template #extra><el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button></template>
        </el-result>
      </div>
      <div v-else class="chat-container" ref="chatPanelRef">
        <div v-for="(item, index) in info.segments" :key="index" :id="`bubble-${index}`"
             class="chat-row animate-fade-in" :style="{ animationDelay: (index * 0.05) + 's' }"
             :class="[item.spk === 'spk0' ? 'row-left' : 'row-right', currentId === index ? 'row-active' : '', currentPlayingId === item.id ? 'row-playing' : '']">
          <div class="chat-avatar">
            <el-avatar :size="40" :style="{ backgroundColor: item.spk === 'spk0' ? '#fff' : '#f5f2ef', color: '#000', border: '1px solid #eee' }">
              {{ item.spk === 'spk0' ? 'A' : 'B' }}
            </el-avatar>
          </div>
          <div class="chat-content">
              <div class="chat-meta">
                <div class="meta-speaker">
                  <span>{{ item.spk === 'spk0' ? '对方' : '我方' }} #{{ index + 1 }}</span>
                </div>
                <div class="edit-btn-group" v-if="!item.isEditing">
                  <div class="tool-item" @click.stop="editSegment(item)"><el-icon><Edit /></el-icon><span>编辑对话</span></div>
                  <div class="tool-item" @click.stop="handleSwitchSpeaker(item, index)"><el-icon><Switch /></el-icon><span>切换角色</span></div>
                  <div class="tool-item" @click.stop="handleSplitSegment(item, index)"><el-icon><Scissor /></el-icon><span>切分对话</span></div>
                </div>
              </div>
              <div class="chat-bubble shadow-sm" @click="togglePlay(item)">
                <div v-if="item.isEditing" class="edit-mode" @click.stop>
                  <el-input v-model="item.editText" type="textarea" autosize class="premium-textarea" />
                  <div class="edit-actions">
                    <button class="action-btn-custom btn-confirm" @click="saveEdit(item, index)" :disabled="item.isSaving">
                      <el-icon v-if="!item.isSaving"><Check /></el-icon>
                      <el-icon v-else class="is-loading"><Loading /></el-icon>
                    </button>
                    <button class="action-btn-custom btn-cancel" @click="cancelEdit(item)" :disabled="item.isSaving">
                      <el-icon><Close /></el-icon>
                    </button>
                  </div>
                </div>
              <div v-else class="display-mode">
                <p class="text-content">{{ item.text }}</p>
                <div class="inline-player" v-if="getAudioUrl(item.path)" @click.stop>
                  <el-button circle size="small" @click="togglePlay(item)">
                    <el-icon><VideoPause v-if="currentPlayingId === item.id && isPlaying" /><VideoPlay v-else /></el-icon>
                  </el-button>
                  <div class="waveform-box">
                    <WaveformPlayer :ref="el => setPlayerRef(el, item.id)" :audio-url="getAudioUrl(item.path)"
                      :is-playing="currentPlayingId === item.id && isPlaying" :playback-rate="item.playbackRate || 1.0"
                      :wave-color="item.spk === 'spk0' ? '#D1D5DB' : '#E5E7EB'" :progress-color="item.spk === 'spk0' ? '#4F46E5' : '#10B981'"
                      @update:is-playing="v => { if(currentPlayingId === item.id) isPlaying = v }" @timeupdate="v => { if(currentPlayingId === item.id) onTimeUpdate(v) }"
                      @ready="v => { if(currentPlayingId === item.id) onPlayerReady(v) }" />
                  </div>
                  <div class="player-meta-right">
                    <div class="rate-row">
                       <el-slider v-model="item.playbackRate" :min="0.5" :max="2.0" :step="0.5" size="small" :show-tooltip="false" style="width: 40px" />
                       <span class="rate-text">{{ item.playbackRate.toFixed(1) }}x</span>
                    </div>
                    <span class="time-text">{{ formatDuration(currentPlayingId === item.id ? currentTime : 0) }} / {{ formatDuration(item.end - item.start) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Custom Confirm Modal -->
    <Transition name="confirm-fade">
      <div v-if="confirmDialog.visible" class="confirm-overlay" @click="confirmDialog.visible = false">
        <div class="confirm-content shadow-lg" @click.stop>
          <div class="confirm-title">{{ confirmDialog.title }}</div>
          <div class="confirm-message">{{ confirmDialog.message }}</div>
          <div class="confirm-actions">
            <button class="action-btn-custom btn-confirm" @click="handleConfirm">
              {{ confirmDialog.confirmText }}
            </button>
            <button class="action-btn-custom btn-cancel" @click="confirmDialog.visible = false">取消</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.detail-page-wrapper { height: calc(100vh - 80px); display: flex; flex-direction: column; overflow: hidden; }
.detail-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; background: #fff; border-bottom: 1px solid #f0f0f0; }
.header-left, .meta-grid, .title-display, .title-edit-form { display: flex; align-items: center; gap: 16px; }
.back-btn { background: #f6f6f6; border: none; }
.back-btn:hover { background: #000; color: #fff; }
.record-title { font-family: 'Waldenburg', sans-serif; font-size: 24px; font-weight: 300; margin: 0; }
.title-display { cursor: pointer; padding: 4px 8px; border-radius: 8px; }
.title-display:hover { background: #f9f9f9; }
.title-edit-icon { color: #999; opacity: 0; transition: 0.2s; }
.title-display:hover .title-edit-icon { opacity: 1; }
.meta-item { display: flex; flex-direction: column; }
.meta-label { font-size: 10px; color: #999; text-transform: uppercase; }
.meta-value { font-size: 13px; font-weight: 500; color: #4e4e4e; }
.meta-divider { width: 1px; height: 20px; background: #eee; }

.action-btn-custom { width: 32px; height: 32px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; font-size: 14px; }
.btn-confirm { background: #000; color: #fff; }
.btn-confirm:hover { background: #333; transform: scale(1.05); }
.btn-confirm:disabled { background: #ccc; cursor: not-allowed; }
.btn-cancel { background: #f0f0f0; color: #666; }
.btn-cancel:hover { background: #e5e5e5; color: #000; }

.detail-main-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.full-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 16px; padding-top: 100px; }
.chat-container { flex: 1; overflow-y: auto; padding: 40px 8%; background: #fff; }
.chat-row { display: flex; margin-bottom: 30px; }
.row-left { flex-direction: row; }
.row-right { flex-direction: row-reverse; }
.chat-content { max-width: 92%; margin: 0 16px; display: flex; flex-direction: column; }
.row-left .chat-content { align-items: flex-start; }
.row-right .chat-content { align-items: flex-end; }

.chat-meta { font-size: 11px; color: #999; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
.row-left .chat-meta { flex-direction: row; }
.row-right .chat-meta { flex-direction: row-reverse; }

.meta-speaker { font-weight: 500; color: #777169; }
.edit-btn-group { display: flex; gap: 12px; }
.row-right .edit-btn-group { flex-direction: row-reverse; }
.tool-item { display: flex; align-items: center; gap: 4px; color: #bbb; cursor: pointer; transition: all 0.2s; padding: 2px 6px; border-radius: 4px; }
.tool-item:hover { color: #000; background: #f6f6f6; }
.tool-item span { font-size: 10px; font-weight: 400; }
.tool-item el-icon { font-size: 13px; }

.chat-bubble { padding: 16px 20px; border-radius: 16px; border: 1px solid #f0f0f0; transition: 0.3s; cursor: pointer; position: relative; min-width: 400px; }
.row-left .chat-bubble { background: #fff; border-top-left-radius: 4px; }
.row-right .chat-bubble { background: #f5f2ef; border-top-right-radius: 4px; }
.row-active .chat-bubble { border-color: #000; box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
.row-playing .chat-bubble { transform: scale(1.02); border-color: #000; box-shadow: 0 15px 30px rgba(0,0,0,0.1); background: #fff; }

.text-content { line-height: 1.6; margin: 0; }
.inline-player { margin-top: 12px; display: flex; align-items: center; gap: 12px; padding-top: 12px; border-top: 1px dashed #eee; }
.waveform-box { flex: 1; }
.player-meta-right { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; flex-shrink: 0; min-width: 60px; margin-left: 10px; }
.rate-row { display: flex; align-items: center; gap: 8px; }
.rate-text { font-size: 10px; color: #777169; white-space: nowrap; }
.time-text { font-size: 10px; color: #999; }

:deep(.el-slider__bar) { background-color: #000; }
:deep(.el-slider__button) { border: 2px solid #000; background-color: #fff; width: 12px; height: 12px; }
:deep(.el-slider__runway) { background-color: #f0f0f0; }
:deep(.el-slider__button:hover) { transform: scale(1.2); cursor: grab; }
:deep(.el-slider__button:active) { cursor: grabbing; }

.chat-container::-webkit-scrollbar { width: 4px; }
.chat-container::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 2px; }

.confirm-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
.confirm-content { background: #fff; border-radius: 16px; padding: 32px; width: 90%; max-width: 400px; display: flex; flex-direction: column; gap: 16px; border: 1px solid #f0f0f0; }
.confirm-title { font-size: 18px; font-weight: 500; color: #000; }
.confirm-message { font-size: 14px; color: #666; line-height: 1.5; }
.confirm-actions { display: flex; flex-direction: row-reverse; gap: 12px; margin-top: 8px; }
.confirm-actions .action-btn-custom { width: auto; padding: 0 24px; border-radius: 24px; }

.confirm-fade-enter-active, .confirm-fade-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; transform: scale(0.95); }
</style>