import { defineStore } from 'pinia'
import request from '@/api/request'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    username: localStorage.getItem('username') || '',
  }),
  actions: {
    async login({ username, password }) {
      const res = await request.post('/auth/login', { username, password })
      const token = res?.data?.access_token || res?.data?.token
      if (!token) throw new Error('Token not found in response')
      this.token = token
      this.username = username
      localStorage.setItem('token', token)
      localStorage.setItem('username', username)
      return res
    },
    async register({ username, password }) {
      const res = await request.post('/auth/register', { username, password })
      return res
    },
    logout() {
      this.token = ''
      this.username = ''
      localStorage.removeItem('token')
      localStorage.removeItem('username')
    },
  },
})
