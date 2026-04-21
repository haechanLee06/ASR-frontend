<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'

const props = defineProps({
  audioUrl: {
    type: String,
    default: ''
  },
  isPlaying: {
    type: Boolean,
    default: false
  },
  playbackRate: {
    type: Number,
    default: 1.0
  }
})

const emit = defineEmits(['update:isPlaying', 'timeupdate', 'ended', 'ready'])

const waveContainer = ref(null)
let wavesurfer = null
let observer = null
const hasLoaded = ref(false)

const initWaveSurfer = () => {
  if (!waveContainer.value) return

  wavesurfer = WaveSurfer.create({
    container: waveContainer.value,
    waveColor: '#e5e5e5', // 浅暖灰
    progressColor: '#000000', // 纯黑
    cursorColor: '#000000',
    cursorWidth: 2,
    height: 48, // 适应行内高度
    barWidth: 1, // 稍微细一些更美观
    barGap: 3, 
    barRadius: 4,
    normalize: true,
    barMinHeight: 0.8, 
  })

  // 事件监听
  wavesurfer.on('ready', () => {
    emit('ready', wavesurfer.getDuration())
    wavesurfer.setPlaybackRate(props.playbackRate) // 设置初始语速
    if (props.isPlaying) {
      wavesurfer.play()
    }
  })

  wavesurfer.on('audioprocess', () => {
    emit('timeupdate', wavesurfer.getCurrentTime())
  })

  wavesurfer.on('finish', () => {
    emit('update:isPlaying', false)
    emit('ended')
    wavesurfer.seekTo(0) // 播放完毕重置
  })

  wavesurfer.on('interaction', () => {
    emit('timeupdate', wavesurfer.getCurrentTime())
  })
}

watch(() => props.audioUrl, (newUrl) => {
  if (wavesurfer && newUrl && hasLoaded.value) {
    wavesurfer.load(newUrl)
  }
})

watch(() => props.isPlaying, (playing) => {
  if (!wavesurfer || !hasLoaded.value) return
  if (playing) {
    wavesurfer.play()
  } else {
    wavesurfer.pause()
  }
})

watch(() => props.playbackRate, (rate) => {
  if (wavesurfer) {
    wavesurfer.setPlaybackRate(rate)
  }
})

onMounted(() => {
  initWaveSurfer()
  
  // 仅在元素进入视口时加载音频数据
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !hasLoaded.value && props.audioUrl) {
      wavesurfer.load(props.audioUrl)
      hasLoaded.value = true
    }
  }, {
    rootMargin: '200px' // 提前加载
  })
  
  if (waveContainer.value) {
    observer.observe(waveContainer.value)
  }
})

onUnmounted(() => {
  if (observer && waveContainer.value) {
    observer.unobserve(waveContainer.value)
    observer.disconnect()
  }
  if (wavesurfer) {
    wavesurfer.destroy()
    wavesurfer = null
  }
})

// 暴露 Seek 和 Reset 方法给父组件
defineExpose({
  seekTo: (time) => {
    if (wavesurfer) {
      const duration = wavesurfer.getDuration()
      if (duration > 0) {
        wavesurfer.seekTo(time / duration)
      }
    }
  },
  reset: () => {
    if (wavesurfer) {
      wavesurfer.seekTo(0)
    }
  },
  getCurrentTime: () => {
    return wavesurfer ? wavesurfer.getCurrentTime() : 0
  }
})
</script>

<template>
  <div class="waveform-wrapper">
    <div ref="waveContainer" class="wave-container"></div>
  </div>
</template>

<style scoped>
.waveform-wrapper {
  width: 100%;
}

.wave-container {
  width: 100%;
  min-height: 48px;
  cursor: pointer;
}

/* 消除 Wavesurfer 默认的一些边距 */
:deep(wave) {
  overflow: hidden !important;
}
</style>
