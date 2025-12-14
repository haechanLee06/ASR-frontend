<script setup>
import { useRouter, RouterLink, RouterView } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

function handleLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <el-container style="min-height: 100vh">
    <el-aside width="220px">
      <el-menu :default-active="$route.path" router>
        <el-menu-item index="/dashboard">语音识别工作台</el-menu-item>
        <el-menu-item index="/history">历史记录</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="display:flex;justify-content:space-between;align-items:center">
        <div>四川话方言语音分析系统</div>
        <div>
          <span style="margin-right:12px">{{ userStore.username || '未登录' }}</span>
          <el-button type="text" @click="handleLogout">退出</el-button>
        </div>
      </el-header>
      <el-main>
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

