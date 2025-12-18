<script setup>
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadAudio, getDetail, deleteRecord } from '@/api/audio'
import { useRouter } from 'vue-router'
import { UploadFilled, View, Loading, Delete } from '@element-plus/icons-vue'

const router = useRouter()
const taskStore = useTaskStore()
const { tasks } = storeToRefs(taskStore)
let pollTimer = null

async function handleUpload(options) {
  try {
    const raw = options.file?.raw || options.file
    // Optimistic UI: show uploading state or just wait for response since it is non-blocking now
    const res = await uploadAudio(raw)
    const recordId = res?.data?.record_id
    
    if (recordId) {
      // Add to task queue
      taskStore.addTask({
        record_id: recordId,
        filename: raw.name,
        status: res.data.status || 'pending',
        created_at: new Date().toLocaleString(),
        current_stage: ''
      })
      ElMessage.success('上传成功，已加入处理队列')
    }
  } catch (e) {
    options.onError && options.onError(e)
    ElMessage.error(e?.message || '上传失败')
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
          error_message: info.error_message || ''
        })
      }
    } catch (e) {
      console.error(`Polling error for ${task.record_id}:`, e)
    }
  }
}

onMounted(() => {
  // Restart polling if there are active tasks
  pollTimer = setInterval(checkStatus, 1000)
  checkStatus() // Immediate check
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const goDetail = (row) => {
  router.push(`/detail/${row.record_id}`)
}
</script>

<template>
  <div class="page-container dashboard-container">
    <div class="dashboard-header">
      <h2>欢迎使用 ASR 语音分析系统</h2>
      <p>上传音频文件，自动进行说话人分离与方言识别分析</p>
    </div>
    
    <div class="upload-wrapper">
      <el-upload
        drag
        :show-file-list="false"
        :http-request="handleUpload"
        accept="audio/*"
        class="custom-upload"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          点击或拖拽上传音频文件 <em>(支持 WAV/MP3)</em>
        </div>
      </el-upload>
    </div>

    <div class="queue-wrapper" v-if="tasks.length > 0">
      <el-card shadow="hover" class="queue-card">
        <template #header>
          <div class="card-header">
            <span>处理队列</span>
            <el-tag v-if="tasks.some(t => ['pending', 'processing'].includes(t.status))" type="warning" size="small" effect="plain" class="processing-tag">
              <el-icon class="is-loading" style="margin-right: 4px"><Loading /></el-icon>正在处理
            </el-tag>
          </div>
        </template>
        <el-table :data="tasks" style="width: 100%" max-height="300">
          <el-table-column prop="filename" label="文件名" min-width="180" show-overflow-tooltip />
          <el-table-column prop="created_at" label="上传时间" width="180" />
          <el-table-column label="状态" min-width="240">
            <template #default="{ row }">
              <div class="status-cell">
                <el-tag v-if="row.status === 'success'" type="success" size="small">完成</el-tag>
                
                <el-tooltip 
                  v-else-if="row.status === 'failed'"
                  :content="row.error_message || '任务处理失败'" 
                  placement="top"
                >
                  <el-tag type="danger" size="small" style="cursor: help;">失败</el-tag>
                </el-tooltip>

                <el-tag v-else-if="row.status === 'processing'" type="primary" size="small" class="processing-tag">
                  <el-icon class="is-loading" style="margin-right: 4px"><Loading /></el-icon>{{ row.current_stage || '系统处理中...' }}
                </el-tag>

                <el-tag v-else-if="row.status === 'pending'" type="info" size="small">
                  排队中...
                </el-tag>
                
                <el-tag v-else type="info" size="small">{{ row.status }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="center">
            <template #default="{ row }">
              <el-button 
                v-if="row.status === 'success'" 
                type="primary" 
                link 
                :icon="View" 
                @click="goDetail(row)"
              >
                查看详情
              </el-button>
              <el-button 
                v-else
                type="danger" 
                link 
                :icon="Delete" 
                @click="handleDelete(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.processing-tag :deep(.el-tag__content) {
  display: flex;
  align-items: center;
}

.dashboard-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start; /* Changed from center to accommodate queue */
  padding-top: 60px;
  min-height: calc(100vh - 100px);
  gap: 40px;
}

.dashboard-header {
  text-align: center;
}

.dashboard-header h2 {
  font-size: 24px;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.dashboard-header p {
  color: var(--text-secondary);
  font-size: 16px;
}

.upload-wrapper {
  width: 100%;
  max-width: 600px;
}

.custom-upload :deep(.el-upload-dragger) {
  width: 100%;
  height: 240px; /* Slightly smaller to fit queue */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  transition: all 0.3s;
  background-color: #fafafa;
}

.custom-upload :deep(.el-upload-dragger:hover) {
  border-color: var(--color-primary);
  background-color: rgba(64, 158, 255, 0.05);
}

.custom-upload .el-icon--upload {
  font-size: 64px;
  color: #909399;
  margin-bottom: 16px;
  transition: color 0.3s;
}

.custom-upload :deep(.el-upload-dragger:hover) .el-icon--upload {
  color: var(--color-primary);
}

.el-upload__text {
  font-size: 16px;
  color: var(--text-primary);
}

.el-upload__text em {
  color: var(--color-primary);
  font-style: normal;
  font-weight: 500;
}

.queue-wrapper {
  width: 100%;
  max-width: 800px;
  animation: slideUp 0.3s ease-out;
}

.queue-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.status-cell {
  display: flex;
  align-items: center;
}

.processing-tag {
  display: inline-flex;
  align-items: center;
}

.processing-tag .el-icon {
  margin-right: 4px;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
