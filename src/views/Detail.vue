<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { getDetail } from '@/api/audio'
import { VideoPlay, VideoPause, ArrowLeft, ArrowRight, Loading } from '@element-plus/icons-vue'

const route = useRoute()
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
const audioElement = new Audio()
const currentTime = ref(0)
const duration = ref(0)
const isDragging = ref(false) // Prevent time update conflict while dragging

// Audio event listeners
audioElement.addEventListener('timeupdate', () => {
  if (!isDragging.value) {
    currentTime.value = audioElement.currentTime
  }
})

audioElement.addEventListener('ended', () => {
  isPlaying.value = false
  currentTime.value = 0
  currentPlayingId.value = null
})

audioElement.addEventListener('loadedmetadata', () => {
  duration.value = audioElement.duration
})

const onSliderInput = (val) => {
  isDragging.value = true
}

const onSliderChange = (val) => {
  isDragging.value = false
  audioElement.currentTime = val
}

const togglePlay = async (segment) => {
  if (!segment) return

  // Sync selection with right panel
  const index = info.value.segments.findIndex(s => s.id === segment.id)
  if (index !== -1) {
    currentId.value = index
  }

  // Check if we are clicking the same segment
  if (currentPlayingId.value === segment.id) {
    if (isPlaying.value) {
      audioElement.pause()
      isPlaying.value = false
    } else {
      try {
        await audioElement.play()
        isPlaying.value = true
      } catch (e) {
        console.error("Playback failed", e)
        isPlaying.value = false
      }
    }
    return
  }

  // Switching to a new segment
  // Stop current if playing
  if (isPlaying.value) {
    audioElement.pause()
  }

  // Reset state
  currentPlayingId.value = segment.id
  currentTime.value = 0
  duration.value = 0 
  isPlaying.value = false // Wait for load

  // Set new source
  const audioUrl = getAudioUrl(segment.path)
  
  if (audioUrl) {
    audioElement.src = audioUrl
    try {
      await audioElement.play()
      isPlaying.value = true
    } catch (e) {
      console.error("Playback failed", e)
      isPlaying.value = false
    }
  } else {
    console.warn("No audio path for segment", segment)
  }
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
      info.value = data
      const segs = data.segments || []
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

onMounted(() => {
  fetchDetail()
})

onUnmounted(() => {
  stopPolling()
  audioElement.pause()
  audioElement.src = ''
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
      <!-- Left Chat Panel -->
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
              :size="40" 
              :style="{ backgroundColor: item.spk === 'spk0' ? 'var(--color-primary)' : '#ff9900' }"
            >
              {{ item.spk === 'spk0' ? 'A' : 'B' }}
            </el-avatar>
          </div>
          
          <div class="chat-content">
            <div class="chat-meta">
              <span class="spk-name">{{ item.spk === 'spk0' ? '对方' : '我方' }}</span>
              <span class="time-tag">#{{ index + 1 }}</span>
            </div>
            <div class="chat-bubble">
              <div class="bubble-text">
                {{ item.text }}
              </div>
              <!-- Mini Player Controls -->
              <div class="mini-player-controls">
                <div class="player-icon" @click.stop="togglePlay(item)">
                  <el-icon v-if="isPlaying && currentPlayingId === item.id"><VideoPause /></el-icon>
                  <el-icon v-else><VideoPlay /></el-icon>
                </div>
                
                <el-slider 
                  v-if="isPlaying && currentPlayingId === item.id"
                  v-model="currentTime" 
                  :max="duration" 
                  :show-tooltip="false"
                  size="small"
                  @input="onSliderInput"
                  @change="onSliderChange"
                />
                <el-slider 
                  v-else
                  :model-value="0" 
                  :max="100" 
                  :show-tooltip="false"
                  size="small"
                  disabled
                />
                
                <div class="time-display">
                  <span v-if="isPlaying && currentPlayingId === item.id">
                    {{ formatDuration(currentTime) }} / {{ formatDuration(duration) }}
                  </span>
                  <span v-else>
                    {{ formatDuration(item.end - item.start) }}
                  </span>
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
      </div>

      <!-- Right Control Panel -->
      <div class="control-panel">
        <div class="control-card">
          <div class="card-header">
            <h3>当前片段</h3>
          </div>
          
          <div v-if="currentSegment" class="current-info">
            <div class="large-text-display">
              {{ currentSegment.text }}
            </div>
            
            <div class="audio-visualizer-placeholder">
              <!-- Placeholder for waveform -->
              <div class="wave-bar" v-for="n in 20" :key="n" :style="{ height: Math.random() * 40 + 10 + 'px' }"></div>
            </div>
            
            <div class="player-controls">
              <div class="buttons">
                <el-button circle :icon="ArrowLeft" @click="playPrev" :disabled="currentId <= 0" />
                <el-button circle type="primary" size="large" @click="togglePlay(currentSegment)">
                  <el-icon size="24">
                    <VideoPause v-if="isPlaying && currentPlayingId === currentSegment.id" />
                    <VideoPlay v-else />
                  </el-icon>
                </el-button>
                <el-button circle :icon="ArrowRight" @click="playNext" :disabled="!info.segments || currentId >= info.segments.length - 1" />
              </div>
            </div>
          </div>
          
          <div v-else class="no-selection">
            请选择左侧对话片段
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-layout {
  display: flex;
  height: 100%;
  gap: 20px;
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
  border-radius: 8px;
  padding: 20px;
  overflow-y: auto;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

.chat-row {
  display: flex;
  margin-bottom: 24px;
  transition: opacity 0.2s;
}

.chat-row:hover .timestamp-hover {
  opacity: 1;
}

.row-left {
  flex-direction: row;
}

.row-right {
  flex-direction: row-reverse;
}

.chat-avatar {
  margin: 0 12px;
}

.chat-content {
  max-width: 70%;
  display: flex;
  flex-direction: column;
  position: relative; /* Anchor for timestamp */
}

.row-left .chat-content {
  align-items: flex-start;
}

.row-right .chat-content {
  align-items: flex-end;
}

.chat-meta {
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
}

.chat-bubble {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  font-size: 15px;
  position: relative;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
}

.row-left .chat-bubble {
  background-color: #ffffff;
  color: #303133;
  border-top-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border: 1px solid #ebeef5;
}

.row-right .chat-bubble {
  background-color: var(--el-color-primary);
  color: #ffffff;
  border-top-right-radius: 4px;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
  border: none;
}

.row-active .chat-bubble {
  border: 2px solid var(--color-primary);
}

/* Hybrid Bubble Components */
.bubble-text {
  word-break: break-word;
}

.mini-player-controls {
  display: flex;
  align-items: center;
  padding: 4px 0;
  margin-top: 8px;
  border-top: 1px solid rgba(0,0,0,0.05);
}

.row-right .mini-player-controls {
  border-top-color: rgba(255,255,255,0.2);
}

.player-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--color-primary);
  cursor: pointer;
  width: 24px;
  height: 24px;
}
.mini-player-controls :deep(.el-slider) {
  --el-slider-main-bg-color: var(--color-primary);
  --el-slider-runway-bg-color: #dcdfe6;
  --el-slider-button-size: 12px;
  --el-slider-height: 4px;
  margin-left: 10px;
  margin-right: 10px;
}

.mini-player-controls :deep(.el-slider__button) {
  border: 2px solid var(--color-primary);
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.row-left .mini-player-controls :deep(.el-slider) {
  --el-slider-main-bg-color: var(--color-primary);
}

.row-right .mini-player-controls :deep(.el-slider__runway) {
  background-color: rgba(255, 255, 255, 0.3);
}

.row-right .mini-player-controls :deep(.el-slider__bar) {
  background-color: #ffffff;
}

.row-right .mini-player-controls :deep(.el-slider__button) {
  border-color: #ffffff;
  background-color: #ffffff;
}

.time-display {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 60px;
  text-align: right;
}

.row-right .time-display,
.row-right .player-icon {
  color: #fff; /* Better contrast on primary color background */
}

/* Timestamp Hover */
.timestamp-hover {
  position: absolute;
  bottom: -20px;
  font-size: 10px;
  color: #909399;
  opacity: 0;
  transition: opacity 0.2s;
  white-space: nowrap;
}

.row-left .timestamp-hover {
  right: 0;
}

.row-right .timestamp-hover {
  left: 0;
  color: rgba(255, 255, 255, 0.8);
}

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

.card-header h3 {
  margin: 0 0 20px 0;
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