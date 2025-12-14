<script setup>
import { ElMessage, ElLoading } from 'element-plus'
import { uploadAudio } from '@/api/audio'
import { useRouter } from 'vue-router'

const router = useRouter()

async function handleUpload(options) {
  const loading = ElLoading.service({
    fullscreen: true,
    text: '正在进行双模型推理 (Paraformer + 四川话)...',
    lock: true,
  })
  try {
    const raw = options.file?.raw || options.file
    const res = await uploadAudio(raw)
    const recordId = res?.data?.record_id
    if (recordId) {
      router.push(`/detail/${recordId}`)
    }
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
  <div class="upload-center">
    <el-card class="upload-card">
      <el-upload
        drag
        :show-file-list="false"
        :http-request="handleUpload"
        accept="audio/*"
        class="upload-area"
      >
        <div class="el-upload__text">拖拽音频到此或点击上传</div>
      </el-upload>
    </el-card>
  </div>
</template>

<style scoped>
.upload-center {
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(100vh - 60px);
}
.upload-card {
  width: 600px;
  padding: 24px;
}
.upload-area {
  width: 100%;
}
</style>
