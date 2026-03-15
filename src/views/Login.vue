<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const isRegister   = ref(false)
const username     = ref('')
const password     = ref('')
const loading      = ref(false)
const showPassword = ref(false)
const userFocused  = ref(false)
const passFocused  = ref(false)

const router    = useRouter()
const userStore = useUserStore()

async function submit() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
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
    ElMessage.error(e?.message || '操作失败，请重试')
  } finally {
    loading.value = false
  }
}

// ─── Full-screen Canvas Wave ─────────────────────────────────────────────────
let animId = null

onMounted(() => {
  const canvas = document.getElementById('wave-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const resize = () => {
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const waves = [
    { amp: 60,  freq: 0.0025, phase: 0,   speed: 0.008, color: 'rgba(99,102,241,0.85)',  lw: 3.5 },
    { amp: 40,  freq: 0.0045, phase: 2.1, speed: 0.012, color: 'rgba(148,163,184,0.60)', lw: 2.5 },
    { amp: 85,  freq: 0.0015, phase: 0.8, speed: 0.005, color: 'rgba(99,102,241,0.50)',  lw: 4   },
    { amp: 30,  freq: 0.0060, phase: 3.5, speed: 0.016, color: 'rgba(255,255,255,0.40)', lw: 2   },
  ]

  const draw = () => {
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    waves.forEach(w => {
      w.phase += w.speed
      ctx.beginPath()
      ctx.lineWidth   = w.lw
      ctx.strokeStyle = w.color
      for (let x = 0; x <= width; x += 2) {
        const y = height / 2 + Math.sin(x * w.freq + w.phase) * w.amp
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    })
    animId = requestAnimationFrame(draw)
  }
  draw()

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  })
})
</script>

<template>
  <!--
    ══ Layer 0: 全屏深色渐变底色 ══
    overflow-hidden 必须在这里，不能套在更外层
  -->
  <div class="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
       style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

    <!--
      ══ Layer 1: 全屏 Canvas 波形（绝对定位，贯穿左右）══
      z-0 确保在内容层之下，backdrop-filter 才能"透"到它
    -->
    <canvas id="wave-canvas"
            class="absolute inset-0 w-full h-full z-0 pointer-events-none">
    </canvas>

    <!--
      ══ Layer 2: 左右分栏内容层（relative z-10，在波形上面）══
    -->
    <div class="relative z-10 flex w-full h-full">

      <!-- ══ LEFT: Brand Column（隐藏于小屏）══ -->
      <div class="hidden lg:flex w-[55%] flex-col items-start justify-center px-12 xl:px-20">

        <!-- Logo -->
        <div class="flex items-center gap-4 mb-12">
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
            <rect width="46" height="46" rx="5" fill="rgba(99,102,241,0.15)"/>
            <rect x="0.75" y="0.75" width="44.5" height="44.5" rx="4.25"
                  stroke="rgba(99,102,241,0.45)" stroke-width="1.5"/>
            <rect x="18" y="9"  width="10" height="15" rx="5"
                  stroke="#a5b4fc" stroke-width="1.7" fill="none"/>
            <path d="M12 25a11 11 0 0022 0" stroke="#a5b4fc"
                  stroke-width="1.7" stroke-linecap="round" fill="none"/>
            <line x1="23" y1="36" x2="23" y2="40" stroke="#a5b4fc"
                  stroke-width="1.7" stroke-linecap="round"/>
            <line x1="18" y1="40" x2="28" y2="40" stroke="#a5b4fc"
                  stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          <div class="flex flex-col gap-1">
            <span class="text-slate-100 font-bold tracking-[3px] text-xl leading-none">
              方言语音转录总结系统
            </span>
            <span class="text-slate-500 font-normal tracking-[4px] text-[12px] leading-none uppercase">
              Dialect ASR &amp; LLM Analysis Platform
            </span>
          </div>
        </div>

        <!-- Accent line -->
        <div class="w-12 h-0.5 bg-indigo-500/60 mb-8"></div>

        <!-- Slogan -->
        <h1 class="text-[40px] xl:text-[50px] font-semibold text-white/90 leading-[1.25] tracking-[2px] mb-5 max-w-xl">
          精准识别方言<br/>洞察语音背后的真实意图
        </h1>
        <p class="text-xl xl:text-lg text-slate-400 leading-relaxed tracking-wide mb-12 max-w-lg">
          基于 Paraformer 模型的方言语音识别与 LLM 深度剖析
        </p>

        <!-- Feature tags -->
        <div class="flex flex-wrap gap-3">
          <span class="inline-flex items-center gap-2.5 px-5 py-2.5 text-sm text-slate-300 tracking-wide"
                style="border-radius:3px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="text-slate-400">
              <rect x="9" y="2" width="6" height="11" rx="3" stroke-width="1.8"/>
              <path d="M5 11a7 7 0 0014 0" stroke-width="1.8" stroke-linecap="round"/>
              <line x1="12" y1="18" x2="12" y2="22" stroke-width="1.8" stroke-linecap="round"/>
              <line x1="8"  y1="22" x2="16" y2="22" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            四川话高精转写
          </span>
          <span class="inline-flex items-center gap-2.5 px-5 py-2.5 text-sm text-slate-300 tracking-wide"
                style="border-radius:3px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="text-slate-400">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.8"/>
              <rect x="9" y="9" width="6"  height="6"  rx="1" stroke-width="1.8"/>
              <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"
                    stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            LLM 语义挖掘
          </span>
          <span class="inline-flex items-center gap-2.5 px-5 py-2.5 text-sm text-slate-300 tracking-wide"
                style="border-radius:3px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="text-slate-400">
              <path d="M18 20V10M12 20V4M6 20v-6"
                    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            对话逻辑论证
          </span>
        </div>
      </div>

      <!--
        ══ RIGHT: Glassmorphism Form Panel ══
        关键：用内联 style 写 backdrop-filter 和 background，
        防止 Tailwind JIT 未能生成对应的类或被 CSS 重置
      -->
<div class="w-full lg:w-[45%] flex items-center justify-center px-6 sm:px-10 md:px-14"
           style="
             background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
             backdrop-filter: blur(20px) saturate(150%);
             -webkit-backdrop-filter: blur(20px) saturate(150%);
             border: 1px solid rgba(255,255,255,0.08);
             border-top: 1px solid rgba(255,255,255,0.20);
             border-left: 1px solid rgba(255,255,255,0.20);
             box-shadow: -15px 0 60px rgba(0,0,0,0.40);
           ">

        <div class="w-full max-w-sm flex flex-col space-y-8">

          <!-- Header -->
          <div>
            <h2 class="text-3xl md:text-[40px] font-bold text-white tracking-tight leading-tight">
              {{ isRegister ? '创建新账户' : '欢迎登录' }}
            </h2>
          </div>

          <!-- Form -->
          <form @submit.prevent="submit" autocomplete="off" class="flex flex-col gap-4">

            <!-- Username -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-slate-400 tracking-wide">用户名</label>
               <div class="relative flex items-center transition-all duration-150"
                    :style="userFocused
                      ? 'border-radius:3px;border:1px solid rgba(167,139,250,0.80);background:rgba(255,255,255,0.10);box-shadow:0 0 0 2px rgba(99,102,241,0.25);'
                      : 'border-radius:3px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);'">
                <svg class="absolute left-3.5 w-5 h-5 pointer-events-none transition-colors"
                     :class="userFocused ? 'text-indigo-300' : 'text-slate-400'"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                <input v-model="username" type="text" placeholder="请输入用户名"
                       autocomplete="username"
                       class="w-full h-14 pl-11 pr-4 bg-transparent outline-none text-base text-white placeholder-slate-400"
                       style="border-radius:3px;"
                       @focus="userFocused = true" @blur="userFocused = false"/>
              </div>
            </div>

            <!-- Password -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-slate-400 tracking-wide">密码</label>
               <div class="relative flex items-center transition-all duration-150"
                    :style="passFocused
                      ? 'border-radius:3px;border:1px solid rgba(167,139,250,0.80);background:rgba(255,255,255,0.10);box-shadow:0 0 0 2px rgba(99,102,241,0.25);'
                      : 'border-radius:3px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);'">
                <svg class="absolute left-3.5 w-5 h-5 pointer-events-none transition-colors"
                     :class="passFocused ? 'text-indigo-300' : 'text-slate-400'"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                <input v-model="password" :type="showPassword ? 'text' : 'password'"
                       placeholder="请输入密码" autocomplete="current-password"
                       class="w-full h-14 pl-11 pr-11 bg-transparent outline-none text-base text-white placeholder-slate-400"
                       style="border-radius:3px;"
                       @focus="passFocused = true" @blur="passFocused = false"/>
                <!-- Eye -->
                <button type="button" tabindex="-1"
                        class="absolute right-3 flex items-center text-slate-500 hover:text-indigo-400 transition-colors"
                        @click="showPassword = !showPassword">
                  <svg v-if="showPassword" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                  <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Submit -->
            <button type="submit" :disabled="loading"
                    class="mt-2 w-full h-14 flex items-center justify-center gap-2
                           text-white text-base font-semibold tracking-[2px]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           hover:-translate-y-px transition-all duration-200 cursor-pointer"
                    style="border-radius:3px;
                           border:1px solid rgba(99,102,241,0.50);
                           background:rgba(79,70,229,0.85);
                           box-shadow:0 0 20px rgba(79,70,229,0.40);"
                    @mouseover="$event.currentTarget.style.background='rgba(99,91,249,0.95)'"
                    @mouseleave="$event.currentTarget.style.background='rgba(79,70,229,0.85)'">
              <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span v-else>{{ isRegister ? '注 册' : '登 录' }}</span>
            </button>

          </form>

          <!-- Footer -->
          <div class="text-center">
            <button type="button"
                    class="text-xs text-slate-500 hover:text-slate-300 hover:underline font-medium
                           transition-colors bg-transparent border-none cursor-pointer"
                    @click="isRegister = !isRegister">
              {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
            </button>
          </div>

        </div>
      </div>
      <!-- ══ END RIGHT ══ -->

    </div>
    <!-- ══ END Layer 2 ══ -->

  </div>
</template>

<style scoped>
/* 强制 backdrop-filter 在所有 WebKit 浏览器生效 */
</style>


