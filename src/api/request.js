import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { pinia } from '@/stores'

const service = axios.create({
  baseURL: 'http://localhost:5000',
})

service.interceptors.request.use((config) => {
  const userStore = useUserStore(pinia)
  if (userStore?.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${userStore.token}`
  }
  return config
})

service.interceptors.response.use(
  (response) => {
    const res = response.data
    // Allow success if code is 200 OR success is true (for APIs that don't return code)
    if (res && res.code !== 200 && res.success !== true) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || 'Error'))
    }
    return res
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      const userStore = useUserStore(pinia)
      userStore.logout()
      location.assign('/login')
    } else {
      ElMessage.error(error?.response?.data?.message || error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

export default service
