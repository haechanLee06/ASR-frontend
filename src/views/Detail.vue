<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import request from '@/api/request'

const route = useRoute()
const info = ref({ segments: [] })
const currentId = ref(-1)
const audioRefs = ref([])

const setAudioRef = (el, index) => {
  if (el) audioRefs.value[index] = el
}

const getAudioUrl = (path) => {
  const p = path || ''
  return p ? `http://localhost:5000/${String(p).replace(/^\//, '')}` : ''
}

const playAudio = (index) => {
  currentId.value = index
  audioRefs.value.forEach((a, i) => {
    if (a) {
      if (i !== index) a.pause()
    }
  })
  const target = audioRefs.value[index]
  if (target) {
    target.currentTime = 0
    target.play()
  }
}

onMounted(async () => {
  const res = await request.get(`/record/${route.params.id}`)
  const segs = res?.data?.segments || []
  info.value.segments = segs
})
</script>

<template>
  <div class="detail-container">
    <div class="chat-flow">
      <div
        v-for="(item, index) in info.segments"
        :key="index"
        class="flow-row"
        :class="{ 'active-row': currentId === index }"
      >
        <div class="chat-side" :class="item.spk === 'spk0' ? 'msg-left' : 'msg-right'">
          <el-avatar
            class="avatar"
            :style="{ backgroundColor: item.spk === 'spk0' ? '#409EFF' : '#ff9900' }"
          >
            {{ item.spk === 'spk0' ? 'A' : 'B' }}
          </el-avatar>
          <div class="bubble" @click="playAudio(index)">
            {{ item.text }}
          </div>
        </div>
        <div class="audio-side">
          <div class="audio-card">
            <span class="audio-label">原音片段 {{ index + 1 }}</span>
            <audio
              :ref="(el) => setAudioRef(el, index)"
              controls
              :src="getAudioUrl(item.path)"
              class="styled-audio"
            ></audio>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-container {
  background-color: #f5f5f5;
  min-height: 100vh;
  padding: 20px;
}
.flow-row {
  display: flex;
  margin-bottom: 20px;
  align-items: flex-start;
}
.active-row .bubble {
  border: 2px solid #409EFF;
}
.chat-side {
  flex: 0 0 60%;
  display: flex;
  gap: 10px;
  padding-right: 20px;
}
.msg-left { flex-direction: row; }
.msg-right { flex-direction: row-reverse; }
.avatar { flex-shrink: 0; }
.bubble {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 15px;
  line-height: 1.5;
  max-width: 80%;
  position: relative;
  cursor: pointer;
  word-break: break-all;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  color: #000;
}
.msg-left .bubble { background-color: #ffffff; border-top-left-radius: 0; }
.msg-right .bubble { background-color: #95ec69; border-top-right-radius: 0; }
.audio-side {
  flex: 0 0 40%;
  padding-left: 20px;
  border-left: 1px dashed #e0e0e0;
  display: flex;
  align-items: center;
}
.audio-card {
  width: 100%;
  background: #fff;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.06));
}
.audio-label { font-size: 12px; color: #999; margin-left: 5px; }
.styled-audio { width: 100%; height: 32px; }
</style>
