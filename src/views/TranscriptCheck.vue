<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTranscriptData, generateSummary } from '@/api/audio'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage, ElNotification } from 'element-plus'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const segments = ref([])
const llmContext = ref('')
const loading = ref(true)
const activeNames = ref([])

// AI Summary States
const isGenerating = ref(false)
const hasSummary = ref(false)
const summaryData = ref({})

const fetchDetail = async () => {
  try {
    const res = await getTranscriptData(id)
    const data = res?.data || {}
    // Backend returns display_data instead of segments
    if (data.display_data) {
      segments.value = data.display_data
    } else if (data.segments) {
      // Fallback in case backend changes back
      segments.value = data.segments
    }
    
    if (data.llm_context) {
      llmContext.value = data.llm_context
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleSummary = async () => {
  if (isGenerating.value) return
  isGenerating.value = true
  try {
    const res = await generateSummary(id)
    console.log('[handleSummary] raw response:', res)

    // 1. 处理可能被序列化成字符串的 JSON
    let parsedData = res
    if (typeof res === 'string') {
      try {
        parsedData = JSON.parse(res)
      } catch (e) {
        throw new Error("模型返回的数据不是有效的 JSON 格式")
      }
    }

    // 核心解包：
    // request.js 已将 axios response.data 提取出来，所以 res = { code:200, data:{summary:{...}} }
    // 第一层：取 .data（即后端业务数据层）
    const businessData = parsedData?.data || parsedData
    // 第二层：取 .summary（即 AI 分析数据）
    const targetData = businessData?.summary || businessData
    console.log('[handleSummary] 剥离后的 targetData:', targetData)

    if (targetData?.overview && targetData?.analysis_breakdown) {

      // 数据防御与清洗：兼容 overview 为字符串或对象两种格式
      let normalizedOverview = { scene_type: '未定义场景', detailed_summary: '' }
      if (typeof targetData.overview === 'string') {
        normalizedOverview.detailed_summary = targetData.overview
      } else if (typeof targetData.overview === 'object') {
        normalizedOverview = {
          scene_type: targetData.overview.scene_type || '未定义场景',
          detailed_summary: targetData.overview.detailed_summary || ''
        }
      }

      // 兼容 role_0/role_A 两种键名
      const rawBreakdown = targetData.analysis_breakdown || {}
      const normalizedRole0 = rawBreakdown.role_0 || rawBreakdown.role_A || {}
      const normalizedRole1 = rawBreakdown.role_1 || rawBreakdown.role_B || {}

      summaryData.value = {
        overview: normalizedOverview,
        analysis_breakdown: {
          role_0: normalizedRole0,
          role_1: normalizedRole1,
        }
      }

      hasSummary.value = true
      ElNotification({
        title: '分析完成',
        message: 'AI 深度侧写已生成',
        type: 'success',
      })
    } else {
      console.error('[handleSummary] 数据结构不完整:', targetData)
      throw new Error("模型返回的数据结构不完整，请检查控制台")
    }
  } catch (e) {
    console.error('[handleSummary] error:', e)
    ElMessage.error(e.message || '生成分析失败，请重试')
  } finally {
    isGenerating.value = false
  }
}



onMounted(() => {
  fetchDetail()
})
</script>

<template>
  <div class="page-container transcript-check-page">
    
    <!-- 1. Header (Fixed Height) -->
    <header class="app-header">
      <el-button 
        class="back-btn" 
        circle 
        :icon="ArrowLeft" 
        @click="router.push(`/detail/${id}`)"
        title="返回详情页"
      />
      <div class="header-title">案件访问记录卷宗 - Record #{{ id }}</div>
    </header>

    <!-- 2. Main Workspace (Flex 1) -->
    <main class="main-content" v-loading="loading">
      
      <!-- Optional Context Preview (Hidden normally) -->
      <div class="context-preview" v-if="llmContext && false">
        <el-collapse v-model="activeNames">
          <el-collapse-item title="查看发送给 AI 的原始内容 (LLM Context)" name="1">
            <div class="context-text-container">
              <pre class="context-text">{{ llmContext }}</pre>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- Flexible Layout Container -->
      <div class="flex-layout">
        
        <!-- Left: Conversation Paper (Dossier) -->
        <div class="transcript-panel" :class="{ 'half-width': hasSummary || isGenerating }">
          <div class="dossier-paper">
            <div class="script-flow">
              <div v-for="(item, index) in segments" :key="index" class="dossier-row">
                <div class="role-district">
                  <span class="role-badge" :class="item.side === 'left' ? 'role-badge-a' : 'role-badge-b'">
                    {{ item.side === 'left' ? '角 色 A' : '角 色 B' }}
                  </span>
                </div>
                <div class="text-district">
                  {{ item.text }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: AI Summary Panel -->
        <div v-if="hasSummary || isGenerating" class="summary-panel scroll-view" v-loading="isGenerating" element-loading-text="AI 正在进行深层心理剖析，请耐心等待...">
          <template v-if="hasSummary && !isGenerating">
            <!-- 1. Overview Card -->
            <el-card shadow="never" class="summary-card mb-4" header="案件场景概览 (Overview)">
              <div class="overview-content">
                <div class="mb-3">
                  <span class="text-secondary mr-2">场景定性：</span>
                  <el-tag effect="dark" type="danger" size="large" class="clinical-tag">
                    {{ summaryData.overview?.scene_type }}
                  </el-tag>
                </div>
                <div class="detailed-summary-box">
                  {{ summaryData.overview?.detailed_summary }}
                </div>
              </div>
            </el-card>

            <!-- 2. Role Analysis breakdown -->
            <div class="section-title">人物侧写与分析 (Clinical Breakdown)</div>
            <el-tabs type="border-card" class="role-tabs clinical-tabs">
              <!-- Role A Tab -->
              <el-tab-pane label="角色 0 (Spk0)">
                <div class="role-info mb-4">
                  <el-descriptions :column="1" border size="small" class="clinical-descriptions">
                    <el-descriptions-item label="角色定性">
                      <el-tag size="small" type="info">{{ summaryData.analysis_breakdown?.role_0?.role_label }}</el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item label="情绪动线">
                      <span class="emotional-state">{{ summaryData.analysis_breakdown?.role_0?.emotional_state }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="隐性意图">
                      <blockquote class="intent-quote">{{ summaryData.analysis_breakdown?.role_0?.hidden_intent }}</blockquote>
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
                
                <h4 class="vfa-title">VFA (Viewpoint, Fact, Analysis) 论证</h4>
                <div class="vfa-block clinical-vfa" v-if="summaryData.analysis_breakdown?.role_0?.VFA_analysis">
                  <div class="vfa-viewpoint">{{ summaryData.analysis_breakdown.role_0.VFA_analysis.viewpoint }}</div>
                  <ul class="fact-list">
                    <li v-for="(fact, fidx) in summaryData.analysis_breakdown.role_0.VFA_analysis.facts" :key="'af-'+fidx">{{ fact }}</li>
                  </ul>
                  <div class="deep-analysis">
                    <strong>深度剖析：</strong>{{ summaryData.analysis_breakdown.role_0.VFA_analysis.deep_analysis }}
                  </div>
                </div>
              </el-tab-pane>

              <!-- Role B Tab -->
              <el-tab-pane label="角色 1 (Spk1)">
                <div class="role-info mb-4">
                  <el-descriptions :column="1" border size="small" class="clinical-descriptions">
                    <el-descriptions-item label="角色定性">
                      <el-tag size="small" type="warning">{{ summaryData.analysis_breakdown?.role_1?.role_label }}</el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item label="情绪动线">
                      <span class="emotional-state">{{ summaryData.analysis_breakdown?.role_1?.emotional_state }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="隐性意图">
                      <blockquote class="intent-quote">{{ summaryData.analysis_breakdown?.role_1?.hidden_intent }}</blockquote>
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
                
                <h4 class="vfa-title">VFA (Viewpoint, Fact, Analysis) 论证</h4>
                <div class="vfa-block clinical-vfa" v-if="summaryData.analysis_breakdown?.role_1?.VFA_analysis">
                  <div class="vfa-viewpoint">{{ summaryData.analysis_breakdown.role_1.VFA_analysis.viewpoint }}</div>
                  <ul class="fact-list">
                    <li v-for="(fact, fidx) in summaryData.analysis_breakdown.role_1.VFA_analysis.facts" :key="'bf-'+fidx">{{ fact }}</li>
                  </ul>
                  <div class="deep-analysis">
                    <strong>深度剖析：</strong>{{ summaryData.analysis_breakdown.role_1.VFA_analysis.deep_analysis }}
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </template>
        </div>
      </div>
    </main>

    <!-- 3. Bottom Action Bar (Fixed Height) -->
    <footer class="bottom-action-bar" v-if="!isGenerating && !hasSummary">
      <el-button type="primary" size="large" class="generate-btn" @click="handleSummary">
        确认无误，生成 AI 心理侧写
      </el-button>
    </footer>
  </div>
</template>
<style scoped>
/* 1. Global Viewport & Scroll Control */
.transcript-check-page {
  height: 100vh;
  /* 移除 width:100vw，避免在有竖向滚动条时出现横向滚动条 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: #f3f4f6;
  position: relative;
  box-sizing: border-box;
}

.app-header {
  height: 60px;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  padding: 0 25px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  z-index: 10;
  flex-shrink: 0; /* 防止头部被挤压 */
}

.back-btn {
  margin-right: 20px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.main-content {
  flex: 1;
  overflow: hidden; /* 由内部容器接管滚动 */
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.bottom-action-bar {
  height: 72px;
  flex-shrink: 0;  /* 不用 absolute，改为文档流底部固定，不影响 main-content 高度 */
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
}

/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* =========================================
   2. 核心修复：Responsive Flex Layout 
========================================= */
.flex-layout {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  min-width: 0;  /* 关键！防止 flex 子项溢出 */
  overflow: hidden;
}

/* 左侧面板：四分 */
.transcript-panel {
  flex: 4;  /* 单独展示时：100% */
  min-width: 0;  /* 防止内容撑爆 */
  height: 100%;
  overflow-y: auto;
  transition: flex 0.35s ease;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

/* 展开双栏后，左边固定比 4/10，右边 6/10 */
.transcript-panel.half-width {
  flex: 4;
}

/* 右侧面板：六分 */
.summary-panel {
  flex: 6;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 32px;
  box-sizing: border-box;
}

@media (max-width: 1024px) {
  .flex-layout { flex-direction: column; }
}

/* =========================================
   3. 左侧 ASR 文本流：提升信息密度！ 
========================================= */
.dossier-paper {
  padding: 28px 32px;
  padding-bottom: 32px; /* 底部 action bar 现在在文档流中，不遮挡内容 */
}

.script-flow {
  display: flex;
  flex-direction: column;
}

.dossier-row {
  display: flex; /* 改为左右排列 */
  align-items: flex-start;
  padding: 16px 0; /* 缩小上下间距 */
  border-bottom: 1px dashed #e5e7eb; /* 增加阅读引导线 */
}

.dossier-row:last-child {
  border-bottom: none;
}

.role-district {
  width: 80px; /* 固定角色标签宽度，保证右侧文本绝对对齐 */
  flex-shrink: 0;
  margin-right: 16px;
}

.role-badge {
  display: inline-block;
  width: 100%;
  text-align: center;
  padding: 4px 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.role-badge-a { background-color: #e0f2fe; color: #0369a1; }
.role-badge-b { background-color: #fef3c7; color: #b45309; }

.text-district {
  flex: 1; /* 文本区域占满剩余空间 */
  font-size: 15px; /* 稍微调小一点字体，更精致 */
  line-height: 1.6;
  color: #374151;
  text-align: justify;
  margin-top: -2px; /* 视觉微调，让文字和左侧 Tag 的视觉中心对齐 */
}

/* =========================================
   4. 右侧 AI Summary 面板对齐优化 
========================================= */
/* 清理 Element Plus 默认自带的冗余 padding */
/* 右侧面板的重复 summary-panel padding 定义（已合并入上方） */

.summary-card :deep(.el-card__header) {
  background-color: transparent;
  font-weight: 700;
  font-size: 16px;
  color: #1f2937;
  border-bottom: none;
  padding: 0 0 16px 0; /* 统一下沉 */
}

.summary-card :deep(.el-card__body) {
  padding: 0; /* 移除默认内边距，手动控制 */
}

.summary-card {
  border: none;
  background: transparent; /* 融于背景 */
}

.clinical-tag {
  letter-spacing: 1px;
  font-weight: bold;
}

.detailed-summary-box {
  background: #f9fafb;
  padding: 16px 20px;
  border-radius: 6px;
  color: #374151;
  line-height: 1.6;
  font-size: 14px;
  border: 1px solid #e5e7eb;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin: 32px 0 16px;
  padding-left: 12px;
  border-left: 4px solid #4f46e5;
}

.clinical-tabs {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: none;
}

.clinical-tabs :deep(.el-tabs__header) {
  background-color: #f9fafb;
}

.clinical-descriptions :deep(.el-descriptions__label) {
  width: 90px;
  background-color: #f9fafb;
  font-weight: 600;
  color: #4b5563;
}

.emotional-state { color: #d97706; font-weight: 600; }

.intent-quote {
  margin: 0;
  padding: 8px 12px;
  background-color: #fefce8;
  border-left: 3px solid #f59e0b;
  color: #4b5563;
  font-size: 13px;
  border-radius: 0 4px 4px 0;
}

.vfa-title {
  font-size: 14px;
  color: #4b5563;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 8px;
  margin-top: 24px;
  margin-bottom: 16px;
}

.clinical-vfa {
  background: transparent;
  padding: 0;
  border: none;
  box-shadow: none;
}

.vfa-viewpoint {
  font-weight: 600;
  color: #111827;
  font-size: 14px;
  margin-bottom: 12px;
  padding-left: 10px;
  position: relative;
}

.vfa-viewpoint::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 3px;
  background-color: #4f46e5;
  border-radius: 2px;
}

.fact-list {
  padding-left: 16px;
  margin: 0 0 16px 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.6;
}

.deep-analysis {
  background-color: #f3f4f6;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  line-height: 1.6;
}
</style>