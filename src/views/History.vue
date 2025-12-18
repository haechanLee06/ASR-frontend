<script setup>
import { onMounted, ref, computed } from 'vue'
import request from '@/api/request'
import { deleteRecord } from '@/api/audio'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'

const tableData = ref([])
const loading = ref(false)
const selectedRows = ref([])
const router = useRouter()

async function fetchHistory() {
  loading.value = true
  try {
    const res = await request.get('/history')
    tableData.value = res?.data || []
  } finally {
    loading.value = false
  }
}

onMounted(fetchHistory)

const handleSelectionChange = (val) => {
  selectedRows.value = val
}

const handleBatchDelete = () => {
  if (selectedRows.value.length === 0) return

  ElMessageBox.confirm(
    `确定要删除选中的 ${selectedRows.value.length} 条记录吗？此操作不可恢复。`,
    '批量删除',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      const ids = selectedRows.value.map(row => row.id || row.record_id)
      await Promise.all(ids.map(id => deleteRecord(id)))
      ElMessage.success('批量删除成功')
      selectedRows.value = [] // Clear selection
      fetchHistory()
    } catch (e) {
      console.error(e)
      ElMessage.error('批量删除过程中出现错误')
      fetchHistory() // Refresh anyway
    }
  }).catch(() => {})
}

const goDetail = (row) => {
  const id = row?.id || row?.record_id
  if (id) {
    router.push(`/detail/${id}`)
  }
}

const handleDelete = (row) => {
  const id = row?.id || row?.record_id
  if (!id) return

  ElMessageBox.confirm(
    '确定要删除该记录及所有音频文件吗？此操作不可恢复。',
    '警告',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      await deleteRecord(id)
      ElMessage.success('删除成功')
      fetchHistory()
    } catch (e) {
      console.error(e)
    }
  }).catch(() => {
    // Cancelled
  })
}

const getStatusType = (status) => {
  if (!status) return 'info'
  const s = String(status).toLowerCase()
  if (s === 'success' || s.includes('完成')) return 'success'
  if (s === 'failed' || s.includes('fail') || s.includes('error') || s.includes('失败')) return 'danger'
  if (s === 'processing' || s === 'pending' || s.includes('loading') || s.includes('处理中')) return 'primary'
  return 'info'
}

const getStatusLabel = (status) => {
  if (!status) return '未知'
  const map = {
    pending: '排队中',
    processing: '处理中',
    success: '已完成',
    failed: '失败'
  }
  return map[status] || status
}
</script>

<template>
  <div class="page-container">
    <el-card shadow="never" class="history-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span>历史记录</span>
            <el-button 
              type="danger" 
              plain 
              size="small" 
              :disabled="selectedRows.length === 0"
              @click="handleBatchDelete"
              style="margin-left: 16px"
            >
              批量删除
            </el-button>
          </div>
          <el-button type="primary" link @click="fetchHistory">刷新</el-button>
        </div>
      </template>
      
      <el-table 
        :data="tableData" 
        v-loading="loading" 
        style="width: 100%"
        :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column label="上传时间" width="200">
          <template #default="{ row }">
            {{ row.upload_time || row.created_at }}
          </template>
        </el-table-column>
        <el-table-column label="原始文件名" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.original_filename || row.filename }}
          </template>
        </el-table-column>
        <el-table-column prop="duration" label="时长" width="120" align="center" />
        <el-table-column prop="status" label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row)">查看详情</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.history-card {
  border: none;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}
.header-left {
  display: flex;
  align-items: center;
}
</style>
