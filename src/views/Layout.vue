<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ArrowDown, Odometer, List, UserFilled } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)

const breadcrumbs = computed(() => {
  const map = {
    '/dashboard': '语言转录工作台',
    '/history': '历史记录',
  }
  const title = map[route.path] || (route.path.startsWith('/detail') ? '识别详情' : '')
  return title ? [{ title }] : []
})

function handleLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="w-screen h-screen overflow-hidden flex bg-slate-50 font-sans text-slate-900">
    
    <!-- Sidebar -->
    <aside class="w-64 flex-shrink-0 bg-white border-r border-[#e5e5e5] flex flex-col z-20">
      <!-- Logo -->
      <div class="h-16 flex items-center gap-3 px-6 cursor-pointer hover:bg-[#f5f5f5] transition-colors border-b border-[#e5e5e5]" @click="router.push('/dashboard')">
          <svg width="24" height="24" viewBox="0 0 46 46" fill="none">
            <rect x="0.75" y="0.75" width="44.5" height="44.5" rx="6" stroke="#000000" stroke-width="2"/>
            <rect x="18" y="9"  width="10" height="15" rx="5" stroke="#000000" stroke-width="2"/>
            <path d="M12 25a11 11 0 0022 0" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
            <line x1="23" y1="36" x2="23" y2="40" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
            <line x1="18" y1="40" x2="28" y2="40" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div class="flex flex-col">
            <span class="text-black font-semibold tracking-wide text-[14px]">方言转录系统</span>
          </div>
      </div>
      <!-- Menu -->
      <nav class="flex-1 py-4 px-3 space-y-2 overflow-y-auto">
        <router-link to="/dashboard" custom v-slot="{ navigate, isActive }">
          <a @click="navigate" class="flex items-center gap-3 px-3 py-2.5 rounded-[12px] transition-all duration-200 cursor-pointer"
              :class="isActive ? 'bg-[#f5f2ef] text-black shadow-warm' : 'text-[#777169] hover:bg-[#f5f5f5] hover:text-black'">
            <el-icon class="text-[18px]"><Odometer /></el-icon>
            <span class="font-medium text-[14px]">工作台</span>
          </a>
        </router-link>
        <router-link to="/history" custom v-slot="{ navigate, isActive }">
          <a @click="navigate" class="flex items-center gap-3 px-3 py-2.5 rounded-[12px] transition-all duration-200 cursor-pointer"
              :class="isActive ? 'bg-[#f5f2ef] text-black shadow-warm' : 'text-[#777169] hover:bg-[#f5f5f5] hover:text-black'">
            <el-icon class="text-[18px]"><List /></el-icon>
            <span class="font-medium text-[14px]">历史记录</span>
          </a>
        </router-link>
      </nav>
    </aside>

    <!-- Main Column -->
    <div class="flex-1 flex flex-col min-w-0 z-10">
      <!-- Header -->
      <header class="h-16 flex-shrink-0 flex items-center justify-between px-8 bg-white border-b border-[#e5e5e5] shadow-[rgba(0,0,0,0.02)_0px_1px_2px] z-20">
        <div class="flex items-center text-[14px] font-medium tracking-wide">
            <span class="text-[#777169] hover:text-black cursor-pointer transition-colors" @click="router.push('/')">首页</span>
            <span class="mx-3 text-[#e5e5e5]">/</span>
            <span class="text-black font-semibold">{{ breadcrumbs.length ? breadcrumbs[0].title : '' }}</span>
        </div>

        <el-dropdown trigger="click">
            <div class="flex items-center gap-2 cursor-pointer hover:bg-[#f5f5f5] px-2 py-1.5 rounded-[12px] transition-colors border border-transparent">
              <div class="w-8 h-8 rounded-full bg-[#f6f6f6] flex items-center justify-center text-[#4e4e4e] font-bold text-[13px] ring-1 ring-[#e5e5e5]">
                <el-icon><UserFilled /></el-icon>
              </div>
              <span class="text-[14px] font-medium text-black">{{ userStore.username || 'User' }}</span>
              <el-icon class="text-[#777169]"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
        </el-dropdown>
      </header>

      <!-- Main Content (Workspace) -->
      <main class="flex-1 overflow-y-auto w-full relative">
          <div class="w-full h-full p-6 md:p-8">
            <RouterView />
          </div>
        </main>
      </div>
    </div>
</template>

<style scoped>
/* Override EP dropdown to fit dark mode if possible via global, but scoped might not work completely, assuming native Tailwind is fine */
</style>
