<script setup>
import { ref } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { uploadAudio } from '@/api/audio'

const tableData = ref([])

function formatTime(s) {
  if (s == null) return ''
  const total = Number(s) || 0
  const m = Math.floor(total / 60)
  const sec = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = sec.toFixed(1).padStart(4, '0')
  return `${mm}:${ss}`
}

function speakerLabel(row) {
  return row.spk ?? row.speaker ?? ''
}

function tagType(row) {
  const spk = row.spk ?? row.speaker ?? ''
  return spk === 'spk1' ? 'success' : 'info'
}

function audioUrl(row) {
  const p = row.path ?? ''
  return p ? `http://localhost:5000/${p}` : ''
}

async function handleUpload(options) {
  const loading = ElLoading.service({
    fullscreen: true,
    text: '正在进行双模型推理 (Paraformer + 四川话)...',
    lock: true,
  })
  try {
    const raw = options.file?.raw || options.file
    const res = await uploadAudio(raw)
    tableData.value = res?.data?.segments || []
    options.onSuccess && options.onSuccess(res)
    ElMessage.success('上传成功')
  } catch (e) {
    options.onError && options.onError(e)
    ElMessage.error(e?.message || '上传失败')
  } finally {
    loading.close()
  }
}
</script>

<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <h1>🎙️ 四川话方言语音分析系统</h1>
    </el-header>
    <el-main>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-card shadow="always" class="upload-card">
            <el-upload
              drag
              :show-file-list="false"
              :http-request="handleUpload"
              accept="audio/*"
            >
              <div class="el-upload__text">拖拽音频到此或点击上传</div>
            </el-upload>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="always" class="result-card">
            <el-table :data="tableData" border style="width: 100%">
              <el-table-column label="说话人" width="120">
                <template #default="scope">
                  <el-tag :type="tagType(scope.row)" disable-transitions>
                    {{ speakerLabel(scope.row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="时间戳" width="200">
                <template #default="scope">
                  {{ formatTime(scope.row.start) }} - {{ formatTime(scope.row.end) }}
                </template>
              </el-table-column>
              <el-table-column prop="text" label="文本" min-width="200" />
              <el-table-column label="原音重现" width="240">
                <template #default="scope">
                  <audio :src="audioUrl(scope.row)" controls style="width: 220px"></audio>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
  
</template>

<style scoped>
.app-container {
  min-height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
}
.el-main {
  padding: 16px;
}
.upload-card,
.result-card {
  min-height: 320px;
}
</style>
