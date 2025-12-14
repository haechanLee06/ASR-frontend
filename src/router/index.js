import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { pinia } from '@/stores'

const Login = () => import('@/views/Login.vue')
const Layout = () => import('@/views/Layout.vue')
const Dashboard = () => import('@/views/Dashboard.vue')
const History = () => import('@/views/History.vue')
const Detail = () => import('@/views/Detail.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login },
    {
      path: '/',
      component: Layout,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: Dashboard },
        { path: 'history', name: 'history', component: History },
        { path: 'detail/:id', name: 'detail', component: Detail },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const userStore = useUserStore(pinia)
  if (to.path !== '/login' && !userStore.token) {
    return '/login'
  }
})

export default router
