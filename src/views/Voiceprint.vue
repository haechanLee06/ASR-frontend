<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Microphone, PictureRounded, Timer, View, Edit } from '@element-plus/icons-vue'
import { getVoiceprintList, enrollVoiceprint, deleteVoiceprint, getVoiceprintHistory, updateVoiceprint } from '@/api/audio'

defineOptions({ name: 'Voiceprint' })

const voiceprints = ref([])
const isLoading = ref(true)

const dialogVisible = ref(false)
const isEnrolling = ref(false)
const enrollForm = ref({
  personName: '',
  file: null
})

// Custom Confirm logic
const confirmDialog = ref({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  onConfirm: null
})

const showConfirm = (title, message, confirmText, onConfirm) => {
  confirmDialog.value = { visible: true, title, message, confirmText, onConfirm }
}

const handleConfirm = async () => {
  if (confirmDialog.value.onConfirm) {
    await confirmDialog.value.onConfirm()
  }
  confirmDialog.value.visible = false
}

// History Drawer State
const historyDrawerVisible = ref(false)
const historyLoading = ref(false)
const historyData = ref({
  personName: '',
  list: []
})

// Audio recording context
const mediaRecorder = ref(null)
const audioChunks = ref([])
const isRecording = ref(false)
const recordingTime = ref(0)
let timer = null

const fileInputRef = ref(null)

const renameDialogVisible = ref(false)
const isRenaming = ref(false)
const renameForm = ref({
  id: null,
  personName: ''
})

const fetchList = async () => {
  isLoading.value = true
  try {
    const res = await getVoiceprintList()
    if (res?.data) {
      voiceprints.value = res.data
    }
  } catch (error) {
    console.error('Failed to get voiceprints', error)
  } finally {
    isLoading.value = false
  }
}

const handleDelete = (row) => {
  showConfirm(
    '删除声纹',
    `确定要永久销毁 [${row.person_name}] 的声纹数据吗？此操作将导致该发音人的身份识别无法自动追溯且不可逆。`,
    '确认销毁',
    async () => {
      try {
        await deleteVoiceprint(row.id)
        ElMessage.success('已从库中销毁')
        fetchList()
      } catch (error) {
        ElMessage.error(error.message || '删除失败')
      }
    }
  )
}

const handleRename = (row) => {
  renameForm.value.id = row.id
  renameForm.value.personName = row.person_name
  renameDialogVisible.value = true
}

const submitRename = async () => {
  if (!renameForm.value.personName.trim()) {
    ElMessage.warning('名称不能为空')
    return
  }
  isRenaming.value = true
  try {
    await updateVoiceprint(renameForm.value.id, renameForm.value.personName.trim())
    ElMessage.success('名称修改成功')
    renameDialogVisible.value = false
    fetchList()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '修改失败')
  } finally {
    isRenaming.value = false
  }
}

const handleViewHistory = async (row) => {
  historyData.value.personName = row.person_name
  historyData.value.list = []
  historyDrawerVisible.value = true
  historyLoading.value = true
  
  try {
    const res = await getVoiceprintHistory(row.id)
    if (res?.code === 200) {
      // Backend returns { data: [...], person_name: "..." }
      // Based on the second implementation I kept: { code: 200, data: [...], person_name: "..." }
      historyData.value.list = res.data
    }
  } catch (error) {
    console.error('Failed to fetch speaker history', error)
    ElMessage.error('获取历史记录失败')
  } finally {
    historyLoading.value = false
  }
}

// ─── Enroll Logic ───
const openEnrollDialog = () => {
  enrollForm.value.personName = ''
  enrollForm.value.file = null
  isRecording.value = false
  recordingTime.value = 0
  dialogVisible.value = true
}

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const onFileChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    enrollForm.value.file = file
  }
  e.target.value = ''
}

const submitEnroll = async () => {
  if (!enrollForm.value.personName.trim()) {
    ElMessage.warning('请输入身份标识 (如真实姓名)')
    return
  }
  if (!enrollForm.value.file) {
    ElMessage.warning('请上传或录制一段音频')
    return
  }

  isEnrolling.value = true
  try {
    await enrollVoiceprint(
      enrollForm.value.personName.trim(), 
      enrollForm.value.file
    )
    ElMessage.success('发音人声纹入库成功')
    dialogVisible.value = false
    fetchList()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '入库失败，请确保音频质量并重试')
  } finally {
    isEnrolling.value = false
  }
}

// ─── Recording Logic ───
const startRecording = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    ElMessage.error('当前浏览器不支持录音功能')
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder.value = new MediaRecorder(stream)
    audioChunks.value = []

    mediaRecorder.value.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.value.push(e.data)
      }
    }

    mediaRecorder.value.onstop = () => {
      const audioBlob = new Blob(audioChunks.value, { type: 'audio/wav' })
      const file = new File([audioBlob], `record_${Date.now()}.wav`, { type: 'audio/wav' })
      enrollForm.value.file = file
      stream.getTracks().forEach(track => track.stop())
    }

    mediaRecorder.value.start()
    isRecording.value = true
    recordingTime.value = 0
    timer = setInterval(() => {
      recordingTime.value++
    }, 1000)

  } catch (err) {
    ElMessage.error('无法获取麦克风权限')
  }
}

const stopRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
    mediaRecorder.value.stop()
    isRecording.value = false
    clearInterval(timer)
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="voiceprint-container max-w-6xl mx-auto w-full pt-4">
    
    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-[32px] font-[300] tracking-[-0.96px] text-black" style="font-family: 'Waldenburg', sans-serif;">声纹管理库</h1>
        <p class="text-[14px] text-[#777169] mt-2 tracking-[0.16px]">管理专属发音人特征，实现音频自动角色识别</p>
      </div>
      <div>
        <button @click="openEnrollDialog"
                class="px-6 py-2.5 bg-black text-white rounded-full text-[14px] font-medium hover:bg-[#333] transition-all shadow-md flex items-center gap-2">
          <el-icon><Plus /></el-icon> 新增声纹
        </button>
      </div>
    </div>

    <!-- Main List -->
    <div class="premium-card p-2 md:p-6 min-h-[400px]">
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
        <svg class="w-8 h-8 text-[#e5e5e5] animate-spin mb-4" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="70 200" stroke-linecap="round"/>
        </svg>
        <p class="text-[13px] text-[#777169]">正在拉取声纹数据...</p>
      </div>

      <div v-else-if="voiceprints.length === 0" class="flex flex-col items-center justify-center py-24">
        <div class="w-16 h-16 rounded-full bg-[#f6f6f6] flex items-center justify-center mb-4">
          <el-icon class="text-2xl text-[#999]"><Microphone /></el-icon>
        </div>
        <p class="text-[15px] text-black font-medium mb-1">空空如也</p>
        <p class="text-[13px] text-[#777169]">暂无声纹库记录，点击右上角"新增声纹"进行录入</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="vp in voiceprints" :key="vp.id" 
             class="group relative border border-[#e5e5e5] rounded-[16px] p-5 bg-white shadow-sm hover:border-emerald-200 hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <!-- Avatar-like -->
              <div class="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-semibold text-[18px] border border-emerald-100">
                {{ vp.person_name.charAt(0).toUpperCase() }}
              </div>
              <div class="flex flex-col">
                <span class="text-[16px] font-medium text-black">{{ vp.person_name }}</span>
                <span class="text-[12px] text-[#aaa] mt-0.5">来源: {{ vp.source_filename }}</span>
              </div>
            </div>
          </div>
          
          <div class="mt-4 pt-4 border-t border-[#f5f5f5] flex items-center justify-between">
            <span class="text-[11px] text-[#999]">{{ vp.created_at }}</span>
            <div class="flex items-center gap-2">
              <button @click="handleRename(vp)" class="p-1.5 rounded-full hover:bg-emerald-50 text-[#999] hover:text-emerald-600 transition-all tooltip" data-tip="修改名称">
                <el-icon class="text-[16px]"><Edit /></el-icon>
              </button>
              <button @click="handleViewHistory(vp)" class="p-1.5 rounded-full hover:bg-emerald-50 text-[#999] hover:text-emerald-600 transition-all tooltip" data-tip="查看活动轨迹">
                <el-icon class="text-[16px]"><Timer /></el-icon>
              </button>
              <button @click="handleDelete(vp)" class="p-1.5 rounded-full hover:bg-rose-50 text-[#ccc] hover:text-rose-500 transition-all tooltip" data-tip="删除该声纹">
                <el-icon class="text-[16px]"><Delete /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- History Drawer -->
    <el-drawer v-model="historyDrawerVisible" :title="`活动轨迹: ${historyData.personName}`" size="520px" class="premium-drawer">
      <div v-loading="historyLoading" class="px-2">
        <div v-if="historyData.list.length === 0 && !historyLoading" class="py-20 flex flex-col items-center justify-center">
          <div class="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
             <el-icon class="text-[24px] text-slate-300"><Timer /></el-icon>
          </div>
          <p class="text-[14px] text-slate-400">该说话人暂无历史识别记录</p>
          <p class="text-[12px] text-slate-300 mt-1">在转录详情页进行声纹匹配后，记录将出现在此处</p>
        </div>

        <div v-else class="space-y-4">
          <div v-for="item in historyData.list" :key="item.record_id" 
               class="p-4 border border-[#f0f0f0] rounded-[12px] hover:border-emerald-200 hover:shadow-sm transition-all bg-white relative group">
            <div class="flex justify-between items-start mb-2">
              <h4 class="text-[14px] font-semibold text-slate-800 line-clamp-1 pr-12">{{ item.title }}</h4>
              <span class="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-medium">
                发言 {{ item.segment_count }} 次
              </span>
            </div>
            <div class="flex items-center justify-between mt-3">
              <div class="flex items-center gap-2 text-[#999]">
                <el-icon class="text-[12px]"><Timer /></el-icon>
                <span class="text-[12px]">{{ item.upload_time }}</span>
              </div>
              <router-link :to="`/detail/${item.record_id}`" class="text-[12px] text-black font-medium hover:underline flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                去看看 <el-icon class="text-[10px]"><View /></el-icon>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- Enroll Dialog -->
    <el-dialog v-model="dialogVisible" title="新增发音人声纹" width="480px" class="premium-dialog" :close-on-click-modal="false">
      <div class="py-2 flex flex-col gap-5">
        
        <!-- Name Input -->
        <div>
          <label class="block text-[13px] font-medium text-gray-700 mb-1.5">身份标识 / 姓名*</label>
          <input v-model="enrollForm.personName" 
                 type="text" 
                 placeholder="例: 张三" 
                 class="w-full px-4 py-2.5 rounded-[10px] border border-[#dcdfe6] focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-[14px]">
        </div>

        <!-- Audio Setup -->
        <div>
          <label class="block text-[13px] font-medium text-gray-700 mb-1.5">采集音频 (建议包含 5 秒以上清晰纯净人声)*</label>
          
          <div class="flex gap-4">
            <!-- Upload -->
            <button @click="triggerFileInput" class="flex-1 py-6 border border-dashed border-[#dcdfe6] rounded-[10px] flex flex-col items-center justify-center hover:bg-[#f6f6f6] hover:border-black transition-all group">
              <el-icon class="text-[24px] text-[#999] group-hover:text-black mb-2 transition-colors"><PictureRounded v-if="enrollForm.file" /><Plus v-else /></el-icon>
              <span class="text-[13px] text-[#666] group-hover:text-black transition-colors">{{ enrollForm.file ? '重新选择文件' : '上传音频文件' }}</span>
            </button>

            <!-- Record -->
            <button @click="isRecording ? stopRecording() : startRecording()" 
                    class="flex-1 py-6 border border-[#dcdfe6] rounded-[10px] flex flex-col items-center justify-center transition-all bg-[length:200%_auto]"
                    :class="isRecording ? 'border-rose-400 bg-rose-50 text-rose-600' : 'hover:bg-[#f6f6f6] text-[#666] hover:text-black'">
              <el-icon class="text-[24px] mb-2" :class="isRecording ? 'animate-pulse' : ''"><Microphone /></el-icon>
              <span class="text-[13px]">
                {{ isRecording ? `正在录制 ${recordingTime}s` : '本地录制' }}
              </span>
            </button>
          </div>
          <input type="file" ref="fileInputRef" accept="audio/*,video/*" class="hidden" @change="onFileChange">

          <div v-if="enrollForm.file" class="mt-3 bg-[#fcfbf9] px-3 py-2 rounded border border-[#f0f0f0] flex items-center justify-between">
            <span class="text-[12px] text-emerald-600 truncate mr-2 font-medium">已就绪: {{ enrollForm.file.name }}</span>
            <el-icon class="text-emerald-500"><svg viewBox="0 0 1024 1024" width="14" height="14"><path d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a31.36 31.36 0 00-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l548.4-692.6c4.1-5.2.4-12.9-6.3-12.9z" fill="currentColor"></path></svg></el-icon>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3 mt-2">
          <button @click="dialogVisible = false" class="px-5 py-2 text-[14px] text-[#666] hover:bg-[#f5f5f5] rounded-full transition-colors" :disabled="isEnrolling">
            取消
          </button>
          <button @click="submitEnroll" class="px-5 py-2 text-[14px] bg-black text-white rounded-full hover:bg-[#333] transition-colors shadow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isEnrolling">
            <el-icon v-if="isEnrolling" class="animate-spin"><Loading /></el-icon>
            {{ isEnrolling ? '声纹入库中...' : '确认提取入库' }}
          </button>
        </div>
      </template>
    </el-dialog>
    <!-- Rename Dialog -->
    <el-dialog v-model="renameDialogVisible" title="修改声纹身份名称" width="440px" class="premium-dialog" :close-on-click-modal="false">
      <div class="py-2">
        <label class="block text-[13px] font-medium text-gray-700 mb-1.5">新的身份标识 / 姓名*</label>
        <p class="text-[12px] text-[#999] mb-3 leading-relaxed">修改后，系统中所有关联到此声纹的转录对话都将自动更新为新名字。</p>
        <input v-model="renameForm.personName" 
               type="text" 
               placeholder="请输入新名称" 
               class="w-full px-4 py-2.5 rounded-[10px] border border-[#dcdfe6] focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-[14px]"
               @keyup.enter="submitRename">
      </div>
      <template #footer>
        <div class="flex justify-end gap-3 mt-2">
          <button @click="renameDialogVisible = false" class="px-5 py-2 text-[14px] text-[#666] hover:bg-[#f5f5f5] rounded-full transition-colors" :disabled="isRenaming">
            取消
          </button>
          <button @click="submitRename" class="px-5 py-2 text-[14px] bg-black text-white rounded-full hover:bg-[#333] transition-colors shadow flex items-center gap-2 disabled:opacity-50" :disabled="isRenaming">
            <el-icon v-if="isRenaming" class="animate-spin"><Loading /></el-icon>
            {{ isRenaming ? '正在更新...' : '保存修改' }}
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- Custom Confirm Modal -->
    <Transition name="confirm-fade">
      <div v-if="confirmDialog.visible" class="confirm-overlay" @click="confirmDialog.visible = false">
        <div class="confirm-content shadow-lg animate-scale-up" @click.stop>
          <div class="confirm-title">{{ confirmDialog.title }}</div>
          <div class="confirm-message">{{ confirmDialog.message }}</div>
          <div class="confirm-actions">
            <button class="action-btn-custom btn-confirm" @click="handleConfirm">
              {{ confirmDialog.confirmText }}
            </button>
            <button class="action-btn-custom btn-cancel" @click="confirmDialog.visible = false">取消</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.tooltip {
  position: relative;
}
.tooltip:hover::after {
  content: attr(data-tip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-6px);
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 1;
}

/* Custom Overlay Style */
.confirm-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
.confirm-content { background: #fff; border-radius: 20px; padding: 32px; width: 90%; max-width: 400px; display: flex; flex-direction: column; gap: 16px; border: 1px solid #f0f0f0; }
.confirm-title { font-size: 20px; font-weight: 500; color: #000; font-family: 'Waldenburg', sans-serif; }
.confirm-message { font-size: 14px; color: #666; line-height: 1.6; }
.confirm-actions { display: flex; flex-direction: row-reverse; gap: 12px; margin-top: 12px; }

.action-btn-custom { height: 40px; padding: 0 24px; border-radius: 24px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; font-size: 14px; font-weight: 500; }
.btn-confirm { background: #000; color: #fff; }
.btn-confirm:hover { background: #333; transform: scale(1.02); }
.btn-cancel { background: #f0f0f0; color: #666; }
.btn-cancel:hover { background: #e5e5e5; color: #000; }

.confirm-fade-enter-active, .confirm-fade-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; transform: scale(0.95); }

@keyframes scaleUp {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
</style>
