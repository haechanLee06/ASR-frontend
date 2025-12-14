<script setup>
import { onMounted, ref } from 'vue'
import request from '@/api/request'
import { useRouter } from 'vue-router'

const tableData = ref([])
const loading = ref(false)
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
const goDetail = (row) => {
  const id = row?.id || row?.record_id
  if (id) {
    router.push(`/detail/${id}`)
  }
}
</script>

<template>
  <el-card>
    <el-table :data="tableData" v-loading="loading" border style="width: 100%">
      <el-table-column prop="created_at" label="上传时间" width="180" />
      <el-table-column prop="filename" label="原始文件名" min-width="180" />
      <el-table-column prop="duration" label="时长" width="120" />
      <el-table-column prop="status" label="状态" width="120" />
      <el-table-column label="操作" width="120">
        <template #default="scope">
          <el-button type="primary" text @click="goDetail(scope.row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
