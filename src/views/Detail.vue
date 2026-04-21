<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getDetail, updateSegmentText, updateSegmentSpeaker, splitSegment } from '@/api/audio'
import { VideoPlay, VideoPause, ArrowLeft, ArrowRight, Loading, Edit, Switch, Scissor } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import WaveformPlayer from '@/components/WaveformPlayer.vue'

const route = useRoute()
const router = useRouter()
const info = ref({ segments: [] })
const currentId = ref(0) // Default to first segment if available, or -1
const chatPanelRef = ref(null)

// New state for async processing
const recordStatus = ref('loading') // loading (initial check), polling, success, failed
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

// New state for player
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

  // Sync selection
  const index = info.value.segments.findIndex(s => s.id === segment.id)
  if (index !== -1) {
    currentId.value = index
  }

  // Check if we are clicking the same segment
  if (currentPlayingId.value === segment.id) {
    isPlaying.value = !isPlaying.value
    return
  }

  // Switching to a new segment
  if (currentPlayingId.value && playerRefs.value[currentPlayingId.value]) {
    playerRefs.value[currentPlayingId.value].reset()
  }

  currentPlayingId.value = segment.id
  currentTime.value = 0
  duration.value = 0 
  isPlaying.value = true
}

const playPrev = () => {
  if (currentId.value > 0) {
    togglePlay(info.value.segments[currentId.value - 1])
  }
}

const playNext = () => {
  if (info.value.segments && currentId.value < info.value.segments.length - 1) {
    togglePlay(info.value.segments[currentId.value + 1])
  }
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

const fetchDetail = async () => {
  try {
    const res = await getDetail(route.params.id)
    const data = res?.data || {}
    
    // Check status
    const status = data.status || 'success' 
    
    if (status === 'success') {
      const segs = (data.segments || []).map(s => ({
        ...s,
        playbackRate: 1.0,
        isEditing: false,
        isSaving: false
      }))
      info.value = { ...data, segments: segs }
      if (segs.length > 0) {
        if (currentId.value === -1 || currentId.value === 0) {
           currentId.value = 0
        }
      } else {
        currentId.value = -1
      }
      recordStatus.value = 'success'
      stopPolling()
    } else if (status === 'failed') {
      recordStatus.value = 'failed'
      errorMsg.value = data.error_message || '任务处理失败'
      stopPolling()
    } else {
      // pending or processing
      recordStatus.value = 'polling'
      if (!pollTimer) {
        pollTimer = setInterval(fetchDetail, 2000)
      }
    }
  } catch (e) {
    console.error(e)
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

const editSegment = (item) => {
  item.isEditing = true
  item.editText = item.text
}

const cancelEdit = (item) => {
  item.isEditing = false
}

const saveEdit = async (item, index) => {
  if (!item.editText || item.editText.trim() === '') {
    ElMessage.warning('文本不能为空')
    return
  }
  if (item.editText === item.text) {
    cancelEdit(item)
    return
  }
  
  item.isSaving = true
  try {
    const res = await updateSegmentText(route.params.id, index, item.editText)
    item.text = item.editText
    item.isEditing = false
    ElMessage.success('修改已保存')
  } catch (e) {
    // 错误在拦截器中已提示
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
  } catch(e) {
    console.error(e)
  } finally {
    item.isSaving = false
  }
}

const handleSplitSegment = async (item, index) => {
  const player = playerRefs.value[item.id]
  const offset = player ? player.getCurrentTime() : 0
  
  if (offset <= 0 || offset >= (item.end - item.start)) {
    ElMessage.warning('请先在波形图上选择合适的切分位置（点击波形图定位光标）')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要在此处 (${formatDuration(offset)}) 将对话切分为两段吗？切分后将使用免 OOM 模式进行二次转录（约需几秒）。`,
      '切分对话',
      { confirmButtonText: '确定切分', cancelButtonText: '取消', type: 'warning' }
    )
    
    // Switch to loading mode
    recordStatus.value = 'polling'
    errorMsg.value = ''
    
    await splitSegment(route.params.id, index, offset)
    ElMessage.success('切分请求已提交，等待处理')
    fetchDetail() // Will start polling or fetch new data and stop loading
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('切分失败')
      console.error(e)
      recordStatus.value = 'success' // restore view
    }
  }
}

onMounted(() => {
  fetchDetail()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="page-container" style="height: calc(100vh - 80px);">
    <!-- Loading State -->
    <div v-if="recordStatus === 'loading' || recordStatus === 'polling'" class="full-loading">
      <div class="loading-content">
        <el-icon class="is-loading" :size="50" color="var(--color-primary)"><Loading /></el-icon>
        <h3>AI 正在努力分析音频，请稍候...</h3>
        <p>当前状态：{{ recordStatus === 'loading' ? '加载中' : '处理中 (自动刷新)' }}</p>
      </div>
    </div>

    <!-- Failed State -->
    <div v-else-if="recordStatus === 'failed'" class="full-error">
      <el-result
        icon="error"
        title="分析失败"
        :sub-title="errorMsg"
      >
        <template #extra>
          <el-button type="primary" @click="$router.push('/dashboard')">返回工作台</el-button>
        </template>
      </el-result>
    </div>

    <!-- Success State (Original Content) -->
    <div v-else class="detail-layout">
      <!-- Chat Panel -->
      <div class="chat-panel" ref="chatPanelRef">
        <div 
          v-for="(item, index) in info.segments" 
          :key="index"
          :id="`bubble-${index}`"
          class="chat-row" 
          :class="[
            item.spk === 'spk0' ? 'row-left' : 'row-right',
            currentId === index ? 'row-active' : ''
          ]"
        >
          <div class="chat-avatar">
            <el-avatar 
              :size="42" 
              :style="{ backgroundColor: item.spk === 'spk0' ? '#ffffff' : '#f5f2ef', color: '#000', border: '1px solid #e5e5e5' }"
            >
              {{ item.spk === 'spk0' ? 'A' : 'B' }}
            </el-avatar>
          </div>
          
          <div class="chat-content">
            <div class="chat-meta">
              <template v-if="item.spk === 'spk0'">
                <span class="spk-name">对方</span>
                <span class="time-tag">#{{ index + 1 }}</span>
                <div class="edit-btn-group">
                  <div v-if="!item.isEditing" class="edit-btn-meta" @click.stop="editSegment(item)" title="编辑内容">
                    <el-icon><Edit /></el-icon>
                  </div>
                  <div v-if="!item.isEditing" class="edit-btn-meta" @click.stop="handleSwitchSpeaker(item, index)" title="切换角色" :class="{ 'is-disabled': item.isSaving }">
                    <el-icon><Switch /></el-icon>
                  </div>
                  <div v-if="!item.isEditing" class="edit-btn-meta" @click.stop="handleSplitSegment(item, index)" title="在此处切分">
                    <el-icon><Scissor /></el-icon>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="edit-btn-group">
                  <div v-if="!item.isEditing" class="edit-btn-meta" @click.stop="handleSplitSegment(item, index)" title="在此处切分">
                    <el-icon><Scissor /></el-icon>
                  </div>
                  <div v-if="!item.isEditing" class="edit-btn-meta" @click.stop="handleSwitchSpeaker(item, index)" title="切换角色" :class="{ 'is-disabled': item.isSaving }">
                    <el-icon><Switch /></el-icon>
                  </div>
                  <div v-if="!item.isEditing" class="edit-btn-meta" @click.stop="editSegment(item)" title="编辑内容">
                    <el-icon><Edit /></el-icon>
                  </div>
                </div>
                <span class="spk-name">我方</span>
                <span class="time-tag">#{{ index + 1 }}</span>
              </template>
            </div>
            <div class="chat-bubble">
              <!-- Edit Mode -->
              <div v-if="item.isEditing" class="bubble-edit-area" @click.stop>
                <el-input
                  v-model="item.editText"
                  type="textarea"
                  autosize
                  class="edit-input"
                />
                <div class="edit-actions">
                  <el-button size="small" @click="cancelEdit(item)" :disabled="item.isSaving">取消</el-button>
                  <el-button type="primary" size="small" :loading="item.isSaving" @click="saveEdit(item, index)">保存</el-button>
                </div>
              </div>
              
              <!-- Display Mode -->
              <div v-else class="bubble-text" @click="togglePlay(item)">
                <div class="text-content">
                  {{ item.text }}
                </div>
                
                <!-- Inline Waveform Player -->
                <div class="inline-player-wrapper" @click.stop v-if="getAudioUrl(item.path)">
                  <el-button 
                    class="inline-play-btn" 
                    circle
                    @click="togglePlay(item)"
                  >
                    <el-icon>
                      <VideoPause v-if="currentPlayingId === item.id && isPlaying" />
                      <VideoPlay v-else />
                    </el-icon>
                  </el-button>
                  <div class="inline-waveform">
                    <WaveformPlayer 
                      :ref="el => setPlayerRef(el, item.id)"
                      :audio-url="getAudioUrl(item.path)"
                      :is-playing="currentPlayingId === item.id && isPlaying"
                      :playback-rate="item.playbackRate || 1.0"
                      @update:is-playing="val => { if(currentPlayingId === item.id) isPlaying = val }"
                      @timeupdate="val => { if(currentPlayingId === item.id) onTimeUpdate(val) }"
                      @ready="val => { if(currentPlayingId === item.id) onPlayerReady(val) }"
                    />
                  </div>
                  
                  <div class="inline-controls">
                    <div class="speed-control" @click.stop>
                      <el-slider 
                        v-model="item.playbackRate" 
                        :min="0.5" 
                        :max="2.0" 
                        :step="0.5"
                        :show-tooltip="false"
                        size="small"
                      />
                      <span class="speed-label">{{ item.playbackRate }}x</span>
                    </div>
                    <div class="inline-time-info">
                      {{ formatDuration(currentPlayingId === item.id ? currentTime : 0) }} / {{ formatDuration(item.end - item.start) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="timestamp-hover">
              {{ formatTime(item.start) }}
            </div>
          </div>
        </div>
        
        <div v-if="info.segments && info.segments.length === 0" class="empty-tip">
          暂无对话数据
        </div>
        <!-- Padding for footer removed since footer is gone -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-layout {
  display: flex;
  height: 100%;
  gap: 20px;
  position: relative; /* 确保底部播放器相对于此容器定位 */
}

.full-loading, .full-error {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 8px;
}

.loading-content {
  text-align: center;
}

.loading-content h3 {
  margin-top: 20px;
  color: var(--text-primary);
}

.loading-content p {
  color: var(--text-secondary);
  margin-top: 10px;
}

/* Chat Panel */
.chat-panel {
  flex: 1;
  background-color: #fff;
  padding: 40px 10%; /* Center the chat stream */
  overflow-y: auto;
  position: relative;
}

/* Adjust scrollbar for chat-panel */
.chat-panel::-webkit-scrollbar {
  width: 6px;
}
.chat-panel::-webkit-scrollbar-thumb {
  background-color: rgba(0,0,0,0.05);
  border-radius: 3px;
}

.chat-row {
  display: flex;
  margin-bottom: 32px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.row-left {
  flex-direction: row;
}

.row-right {
  flex-direction: row-reverse;
}

.chat-avatar {
  margin: 0 16px;
  flex-shrink: 0;
}

.chat-content {
  max-width: 70%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.row-left .chat-content {
  align-items: flex-start;
}

.row-right .chat-content {
  align-items: flex-end;
}

.chat-meta {
  margin-bottom: 6px;
  font-size: 12px;
  color: #777169;
  display: flex;
  gap: 8px;
}

.row-active .chat-bubble {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08); /* More subtle active state */
  border-color: #000;
}

.chat-bubble {
  padding: 16px 20px;
  border-radius: 16px;
  line-height: 1.6;
  font-size: 15px;
  position: relative;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  border: 1px solid #f0f0f0;
  cursor: pointer;
  transition: transform 0.2s;
}

.chat-bubble:hover {
  transform: translateY(-1px);
}

.row-left .chat-bubble {
  background-color: #ffffff;
  border-top-left-radius: 4px;
}

.row-right .chat-bubble {
  background-color: #f5f2ef;
  border-top-right-radius: 4px;
}

.row-active .chat-bubble {
  border-color: #000;
  background-color: #fff;
}

.text-content {
  position: relative;
  margin-bottom: 12px;
}

.inline-player-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}

.inline-play-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.inline-play-btn:hover {
  background: var(--color-primary-light);
}

.inline-waveform {
  flex: 1;
  min-width: 120px;
}

.inline-controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  min-width: 100px;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 10px;
  border-radius: 6px;
}

:deep(.el-slider) {
  flex: 1;
  margin-right: 6px; /* 为滑块停留在最大值时留出空间，防止遮挡文字 */
  --el-slider-main-bg-color: #000;
  --el-slider-runway-bg-color: #e5e5e5;
  --el-slider-stop-bg-color: #fff;
}

.speed-label {
  font-size: 10px;
  font-weight: 700;
  color: #000;
  min-width: 24px;
}

.edit-btn-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: #c0c4cc;
  transition: all 0.2s;
  padding: 2px 6px;
  border-radius: 4px;
}

.row-left .edit-btn-meta { margin-left: 8px; }
.row-right .edit-btn-meta { margin-right: 8px; }

.edit-btn-meta:hover {
  color: #000;
  background: #f0f0f0;
}

.edit-btn-meta span {
  font-size: 11px;
}

.edit-btn-group {
  display: flex;
  gap: 2px;
}

.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.edit-btn-wrapper { display: none; } /* Hide old hover button */

.inline-time-info {
  font-size: 10px;
  color: #777169;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.edit-btn-wrapper {
  position: absolute;
  right: 12px;
  bottom: 8px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.chat-bubble:hover .edit-btn-wrapper {
  opacity: 0.5;
}

.edit-btn-wrapper:hover {
  opacity: 1 !important;
}

.timestamp-hover {
  position: absolute;
  bottom: -20px;
  font-size: 10px;
  color: #909399;
  opacity: 0;
  transition: opacity 0.2s;
}

.row-left .timestamp-hover { right: 0; }
.row-right .timestamp-hover { left: 0; }

.empty-tip {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
}

/* Right Control Panel */
.control-panel {
  width: 350px;
  flex-shrink: 0;
}

.control-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.current-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.large-text-display {
  font-size: 20px;
  line-height: 1.6;
  color: var(--text-primary);
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  background: #f9fafb;
  border-radius: 8px;
}

.audio-visualizer-placeholder {
  height: 100px;
  background: #f0f2f5;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.wave-bar {
  width: 6px;
  background-color: var(--color-primary);
  border-radius: 3px;
  animation: wave 1.2s infinite ease-in-out;
}

.player-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: auto;
}

.buttons {
  display: flex;
  align-items: center;
  gap: 20px;
}

.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>