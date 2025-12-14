<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const isRegister = ref(false)
const username = ref('')
const password = ref('')
const loading = ref(false)

const router = useRouter()
const userStore = useUserStore()

async function submit() {
  loading.value = true
  try {
    if (isRegister.value) {
      await userStore.register({ username: username.value, password: password.value })
      ElMessage.success('注册成功，请登录')
      isRegister.value = false
    } else {
      await userStore.login({ username: username.value, password: password.value })
      ElMessage.success('登录成功')
      router.push('/dashboard')
    }
  } catch (e) {
    ElMessage.error(e?.message || '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-container style="min-height:100vh">
    <el-main style="display:flex;justify-content:center;align-items:center">
      <el-card style="width:360px">
        <h2 style="text-align:center; margin-bottom:12px">
          {{ isRegister ? '注册' : '登录' }}
        </h2>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="用户名">
            <el-input v-model="username" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="password" type="password" placeholder="请输入密码" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" style="width:100%" @click="submit">
              {{ isRegister ? '注册' : '登录' }}
            </el-button>
          </el-form-item>
          <div style="text-align:center">
            <el-link @click="isRegister = !isRegister">
              {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
            </el-link>
          </div>
        </el-form>
      </el-card>
    </el-main>
  </el-container>
</template>
