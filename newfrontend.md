# 前端工程架构与交互深度报告 (ASR-Frontend)
> **文档说明**：本报告基于对 `ASR-frontend` 仓库全量源码的深度扫描，覆盖 `src/stores`、`src/api`、`src/router`、`src/views`、`src/components` 全部核心文件，用于毕业论文前后端交互时序图及系统架构图的绘制。
> 生成时间：2026-04-26 (Latest Update)

---

## 系统概览 (System Overview)

| 维度 | 内容 |
|------|------|
| **项目名称** | ASR-Frontend（四川话方言语音智能质检系统前端） |
| **构建工具** | Vite |
| **UI 框架** | Vue 3（Composition API，`<script setup>` 语法） |
| **UI 组件库** | Element Plus |
| **HTTP 客户端** | Axios（封装为独立 `request.js` 单例） |
| **状态管理** | Pinia（2 个 Store：`user`、`task`） |
| **路由** | Vue Router 4（History 模式，带全局前置守卫） |
| **样式方案** | TailwindCSS + 少量 Scoped CSS |
| **后端基地址** | `http://localhost:5000` |
| **核心业务** | 音频上传 → 异步 ASR 转写 → 文本核查 (四川话优化) → 对话总结生成 (LLM) |

---

## 1. 全局状态管理 (Pinia Stores)

### 1.1 `src/stores/index.js` — Pinia 实例导出

```js
// 导出全局单例 pinia，供 request.js 和 router 在 Vue App 上下文之外使用
export { pinia }
```

> **关键设计**：`pinia` 实例在此导出，使得 `request.js` 和路由守卫均可在 Vue 组件树之外调用 `useUserStore(pinia)`，解决了 Pinia 实例上下文问题。

---

### 1.2 `src/stores/user.js` — 用户鉴权状态 Store

**Store ID**：`'user'`  
**定义风格**：Options Store（`defineStore('user', { state, actions })`）

#### State 变量

| 变量名 | 类型 | 初始值来源 | 用途 |
|--------|------|-----------|------|
| `token` | `String` | `localStorage.getItem('token') \|\| ''` | 存储 JWT Token，用于请求拦截器自动注入 Authorization Header |
| `username` | `String` | `localStorage.getItem('username') \|\| ''` | 存储当前登录用户名，用于 UI 问候语、面包屑 |

> **持久化策略**：token 与 username 均同步写入 `localStorage`，页面刷新后 Store 可从本地恢复登录状态，实现无感知持久登录。

#### Actions 方法

| 方法名 | 参数 | 核心逻辑 |
|--------|------|---------|
| `login({ username, password })` | `{ username: string, password: string }` | `POST /auth/login` → 提取 `res.data.access_token \|\| res.data.token` → 同步至 `this.token`、`this.username` 及 `localStorage` |
| `register({ username, password })` | `{ username: string, password: string }` | `POST /auth/register` → 仅返回响应，登录需单独调用 `login()` |
| `logout()` | 无 | 清空 `this.token`、`this.username`，并调用 `localStorage.removeItem('token')` / `localStorage.removeItem('username')` |

---

### 1.3 `src/stores/task.js` — 任务队列管理 Store

**Store ID**：`'task'`  
**定义风格**：Setup Store（Composition API 风格，`defineStore('task', () => { ... })`）

#### State 变量

| 变量名 | 类型 | 初始值 | 用途 |
|--------|------|--------|------|
| `tasks` | `ref([])` 响应式数组 | `[]` | 保存所有已上传任务的对象列表，用于 Dashboard 轮询与进度展示 |

**任务对象结构**（`addTask` 时写入）：
```js
{
  record_id: string,      // 后端返回的唯一记录 ID
  filename: string,       // 原始文件名
  status: string,         // 'pending' | 'processing' | 'success' | 'failed'
  created_at: string,     // 本地时间字符串
  current_stage: string,  // 后端当前处理阶段描述（如 "Paraformer 引擎正在转写中..."）
  progress: number        // 实际进度百分比（0-100），后端推送
}
```

#### Actions 方法

| 方法名 | 参数 | 核心逻辑 |
|--------|------|---------|
| `addTask(task)` | `task: Object` | `tasks.value.unshift(task)`，插入队列头部（最新任务显示在最前） |
| `updateTask(id, info)` | `id: string, info: Object` | 通过 `tasks.value.find(t => t.record_id === id)` 定位任务，`Object.assign(task, info)` 合并更新（驱动进度条响应式刷新） |
| `removeTask(id)` | `id: string` | `tasks.value.findIndex` + `splice(index, 1)` 移除指定任务 |

---

## 2. 核心 API 封装与请求层

### 2.1 `src/api/request.js` — Axios 实例与拦截器

#### Axios 实例配置

```js
const service = axios.create({
  baseURL: 'http://localhost:5000',
  // 无全局 timeout 设置（generateSummary 单独配置 300000ms）
})
```

#### 请求拦截器 (Request Interceptor)

```js
service.interceptors.request.use((config) => {
  const userStore = useUserStore(pinia)   // 在组件上下文外安全获取 Store
  if (userStore?.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${userStore.token}`  // 自动注入 JWT
  }
  return config
})
```

**鉴权机制**：每一个请求在发出前，拦截器自动读取 `userStore.token`，若存在则在 HTTP Header 中附加 `Authorization: Bearer <token>`，无需业务代码手动传入。

#### 响应拦截器 (Response Interceptor)

```js
service.interceptors.response.use(
  (response) => {
    const res = response.data
    // 业务层判断：code !== 200 且 success !== true 时视为失败
    if (res && res.code !== 200 && res.success !== true) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || 'Error'))
    }
    return res  // 直接返回 response.data，业务层直接拿到 { code, data, message }
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      // 全局未授权处理：自动登出并强制跳转登录页
      const userStore = useUserStore(pinia)
      userStore.logout()
      location.assign('/login')      // 强制整页跳转（非 router.push）
    } else {
      ElMessage.error(error?.response?.data?.message || error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)
```

**关键设计点**：
- **双重成功判断**：兼容 `{ code: 200 }` 和 `{ success: true }` 两种后端响应格式
- **401 全局拦截**：Token 失效时自动执行 `logout()` + `location.assign('/login')`，无需业务代码处理

---

### 2.2 `src/api/audio.js` — 业务 API 函数封装

所有函数均为具名导出（`export const` / `export function`），供各 Vue 组件按需引入。

| 函数名 | HTTP Method | 接口路径 | 参数 | 返回值/说明 |
|--------|------------|---------|------|------------|
| `uploadAudio(file)` | `POST` | `/upload` | `file: File`（封装为 `FormData`，字段名 `file`） | `{ record_id, status: 'pending' }`，非阻塞上传 |
| `getDetail(id)` | `GET` | `/record/${id}` | `id: string` | `{ status, segments, current_stage, progress, error_message }` |
| `deleteRecord(id)` | `DELETE` | `/record/${id}` | `id: string` | 删除成功响应 |
| `getTranscriptData(id)` | `GET` | `/api/transcript_data/${id}` | `id: string` | `{ display_data: [...], llm_context: string }` |
| `updateSegmentText(recordId, segmentIndex, text)` | `PUT` | `/record/${recordId}/segment/${segmentIndex}` | `recordId: string, segmentIndex: number, text: string` | Payload: `{ text }`，持久化保存修改后的转录文本 |
| `generateSummary(id)` | `POST` | `/api/summary/${id}` | `id: string` | 配置 `timeout: 300000`（5分钟），支撑 LLM 复杂方言推理 |
| `getDashboardAmbient()` | `GET` | `/api/dashboard/ambient` | 无 | 获取环境信息（天气、温度、运行时间） |
| `getDashboardHealth()` | `GET` | `/api/dashboard/health` | 无 | 获取 ASR 与 LLM 服务健康状态 |
| `getDashboardStats()` | `GET` | `/api/dashboard/stats` | 无 | `{ total_transcribed, total_summarized, uptime_hours }` |
| `getDashboardKeywords()` | `GET` | `/api/dashboard/keywords` | 无 | `[{ name: string, value: number }]`，关键词词频数组 |
| `getDashboardRecentRecords()` | `GET` | `/api/dashboard/recent_records` | 无 | `[{ id, title, status, status_label, created_at }]`，Top 5 最近记录 |
| `getVoiceprintList()` | `GET` | `/api/voiceprint/list` | 无 | 获取当前用户声纹库全量列表 |
| `enrollVoiceprint(name, file)` | `POST` | `/api/voiceprint/enroll` | `name: string, file: File` | 提取音频特征并入库身份 |
| `updateVoiceprint(id, name)` | `PUT` | `/api/voiceprint/${id}` | `id: number, name: string` | **级联更新**：修改声纹名并自动同步所有历史对话 |
| `getMatchSuggestions(recId)` | `GET` | `/api/voiceprint/match_suggestions/${id}` | `id: number` | 基于余弦相似度推荐匹配身份 |
| `getVoiceprintHistory(id)` | `GET` | `/api/voiceprint/${id}/history` | `id: number` | 追溯该说话人在所有音频中的活动轨迹 |

---

## 3. 复杂交互逻辑剖析

### 3.1 异步任务轮询机制

系统针对不同页面实现了**双层轮询策略**：

#### Dashboard.vue — 任务队列轮询

```js
// onMounted 时启动，周期：1000ms（1秒）
pollTimer = setInterval(checkStatus, 1000)

const checkStatus = async () => {
  // 过滤：仅轮询非终态任务（排除 success/failed）
  const activeTasks = tasks.value.filter(t => !['success', 'failed'].includes(t.status))
  if (activeTasks.length === 0) return

  for (const task of activeTasks) {
    const res = await getDetail(task.record_id)
    const info = res?.data?.info || res?.data
    taskStore.updateTask(task.record_id, {
      status: info.status,
      current_stage: info.current_stage || '',
      progress: info.progress || (info.status === 'success' ? 100 : 0)
    })
    // 任务终态时刷新大盘统计数据
    if (['success', 'failed'].includes(info.status)) {
      fetchDashboardThree()
      fetchDashboardStats()
    }
  }
}

// onUnmounted 时清除，防止内存泄露
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
```

**触发条件**：`onMounted` 时无条件启动，`checkStatus` 内部自行判断是否存在活跃任务  
**停止条件**：`onUnmounted` 时`clearInterval`（页面级销毁），轮询本身不手动 clear，依赖组件生命周期

#### Detail.vue — 详情页状态轮询

```js
// 触发条件：fetchDetail 首次返回状态为 pending/processing 时启动
if (!pollTimer) {
  pollTimer = setInterval(fetchDetail, 2000)  // 周期：2000ms（2秒）
}

// 停止条件：状态变为 success 或 failed
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
// fetchDetail 内：status === 'success' 或 'failed' 时调用 stopPolling()
// onUnmounted 时也调用 stopPolling()
```

---

### 3.2 "阻尼减速"伪进度条算法

**设计背景**：后端 AI 推理时间不可预测（通常 10s~120s），直接显示 0% 会造成"卡死"的感知，伪进度条提供"永远在前进"的心理安抚。

**算法实现**（`Dashboard.vue`，`setInterval(..., 100)` 即每100ms一次）：

```js
// 三阶段阻尼策略
fakeProgressInterval = setInterval(() => {
  if (isUploading.value) {
    // 阶段一：上传中 → 快速线性增长至 20%
    if (fakeProgress.value < 20) fakeProgress.value += 1

  } else if (activeTask.value) {

    if (activeTask.value.status === 'pending') {
      // 阶段二：排队中 → 中速线性增长，上限 35%
      if (fakeProgress.value < 35) fakeProgress.value += 0.5

    } else if (activeTask.value.status === 'processing') {
      // 阶段三：处理中 → 阻尼指数衰减，永远逼近 99% 但不到达
      if (fakeProgress.value < 99) {
        const diff = 99 - fakeProgress.value          // 剩余距离
        const increment = Math.max(0.01, diff * 0.005) // 增量 = diff * 0.5%，最小 0.01
        fakeProgress.value += increment               // → 指数衰减，越接近 99% 越慢
      }

    } else if (activeTask.value.status === 'success') {
      // 终态：后端确认成功后，瞬间拉到 100%
      fakeProgress.value = 100
    }
  } else {
    fakeProgress.value = 0  // 无任务时归零
  }
}, 100)
```

**数学原理**：设当前进度为 $p$，每帧增量 $\Delta = \max(0.01, (99-p) \times 0.005)$，这是一个向 $p=99$ 指数收敛的离散迭代，理论上永远不会到达 99%（实际会在若干分钟后因浮点精度截断），确保在引擎实际完成前"差那么一点点"。

**最终显示值**：
```js
const currentProgress = computed(() => {
  if (isUploading.value) return Math.floor(fakeProgress.value)
  if (activeTask.value) {
    if (activeTask.value.progress && activeTask.value.progress > 0)
      return activeTask.value.progress   // 优先使用后端真实进度
    return Math.floor(fakeProgress.value) // 后端未返回时使用伪进度
  }
  return 0
})
```

---

### 3.3 音文对齐与 HTML5 Audio 控制

**音频实例**：`Detail.vue` 中通过 `const audioElement = new Audio()` 在组件级别创建单例音频对象，不依赖 Vue 的响应式系统直接操作原生 DOM Audio API。

#### 核心函数签名

```js
const togglePlay = async (segment) => { ... }
// segment 结构: { id, text, spk, path, start, end, ... }
```

#### 完整播放控制逻辑

```js
const togglePlay = async (segment) => {
  if (!segment) return

  // 1. 同步右侧控制面板选中状态
  const index = info.value.segments.findIndex(s => s.id === segment.id)
  if (index !== -1) currentId.value = index

  // 2. 点击同一片段 → 切换播放/暂停
  if (currentPlayingId.value === segment.id) {
    if (isPlaying.value) {
      audioElement.pause();  isPlaying.value = false
    } else {
      await audioElement.play(); isPlaying.value = true
    }
    return
  }

  // 3. 切换到新片段 → 停止当前 + 加载新音频
  if (isPlaying.value) audioElement.pause()
  currentPlayingId.value = segment.id
  currentTime.value = 0; duration.value = 0; isPlaying.value = false

  // 4. 构造音频 URL 并播放
  const audioUrl = getAudioUrl(segment.path)
  // getAudioUrl: 'http://localhost:5000/' + path.replace(/^\//, '')
  audioElement.src = audioUrl
  await audioElement.play()
  isPlaying.value = true
}
```

#### Audio API 事件监听（进度同步）

```js
// 实时同步播放进度 → el-slider 双向绑定 currentTime
audioElement.addEventListener('timeupdate', () => {
  if (!isDragging.value) currentTime.value = audioElement.currentTime
})

// 播放结束 → 重置状态
audioElement.addEventListener('ended', () => {
  isPlaying.value = false; currentTime.value = 0; currentPlayingId.value = null
})

// 元数据加载完毕 → 获取总时长
audioElement.addEventListener('loadedmetadata', () => {
  duration.value = audioElement.duration
})
```

**关于 `start_time` / `end_time` 的处理**：每个片段由后端在服务器端预先**切分**为独立音频文件（`segment.path` 指向切分后的小文件），前端直接加载切分后的小文件播放，**不**使用 `currentTime` Seek 策略。`item.start` / `item.end` 仅用于：
- 气泡悬浮时显示时间戳：`{{ formatTime(item.start) }}`  
- 非激活状态下显示片段时长：`formatDuration(item.end - item.start)`  

#### 进度条拖拽（Seek）控制

```js
const onSliderInput  = (val) => { isDragging.value = true }   // 开始拖拽：锁定 timeupdate 更新
const onSliderChange = (val) => {
  isDragging.value = false
  audioElement.currentTime = val  // 松手后 Seek 到指定位置
}
```

---

### 3.5 音频取证级波形控制 (Wavesurfer.js Integration)

**技术演进**：系统从原生 HTML5 Audio 演进到了基于 `wavesurfer.js` 的专业波形图控制，提供了亚秒级的音频 Seek 能力与声纹可视化。

#### 懒加载与性能优化 (`WaveformPlayer.vue`)

```js
// 基于 IntersectionObserver 的单例懒加载策略
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !hasLoaded.value && props.audioUrl) {
      wavesurfer.load(props.audioUrl)
      hasLoaded.value = true // 防止滚动时重复请求
    }
  }, { rootMargin: '200px' }) // 提前预加载
  if (waveContainer.value) observer.observe(waveContainer.value)
})
```

**设计要点**：针对长通话场景，仅在气泡进入视口时初始化 Canvas 渲染，解决了千行级剧本导致的 DOM 内存溢出问题。

---

### 3.6 四川话方言识别展示逻辑 (Sichuanese Presentation)

**方言质检业务背景**：针对四川话中的语气助词（“噻”、“嘛”）与特定语法结构，前端实现了多角色、强交互的视觉对齐。

#### 多角色镜像对齐方案 (Role Tagging)
解析 `spk` 标签进行动态渲染，并利用 CSS Flex 布局实现沉浸式对话审美：
- **spk0 (对方)**：头像-名称-工具栏 顺序对齐（靠左）。
- **spk1 (我方)**：工具栏-名称-头像 倒序对齐（靠右）。

```css
/* 镜像对齐算法 */
.row-left .chat-meta { flex-direction: row; }
.row-right .chat-meta { flex-direction: row-reverse; }
```

---

### 3.7 数据一致性与时间戳同步方案 (Data Integrity)

**技术挑战**：修改对话片段（子表）时，父级记录（主表）的 `updated_at` 不会自动触写。

#### “触碰式”更新策略 (Touch Mechanism)
1. **后端**：在修改接口显式执行 `record.updated_at = datetime.utcnow()`。
2. **前端**：操作成功后触发 `fetchRecordInfo` 增量刷新函数，仅更新同步时间戳和标题，不重载对话流，避免“滚动跳动” (Scroll Jump)。

---

### 3.8 Dashboard 动态感知系统 (Environmental Perception)

**全天候健康监控**：利用 `Promise.allSettled` 并行请求 ASR 与 LLM 服务健康状态，并通过三态指示灯（灰/绿/红）实时展示。
**Session 感知**：比对 API 返回的 `upload_time` 与本地 `sessionStartTime`，自动为新任务标记带波纹动画的 `NEW` 勋章。

---

### 3.10 声纹特征库与身份自动关联机制 (Voiceprint Subsystem)

**业务逻辑**：系统实现了基于 3D-Speaker 特征向量的声纹库，解决了转录中“说话人0”、“说话人1”等匿名 ID 的具名化问题。

#### 1. 采集与入库 (Enrollment)
前端通过 `navigator.mediaDevices.getUserMedia` 实现本地 5s-15s 的高清音频采集，或通过 `File API` 上传存量音频。后端提取名为 `embedding.npy` 的 192 维特征向量持久化存储。

#### 2. 身份自动建议 (Matching Strategy)
当用户进入 `Detail.vue` 且记录未匹配时，前端自动调用 `getMatchSuggestions`。
- **匹配算法**：后端对比 `RecordSpeaker` 与 `VoicePrint` 库。
- **UI 引导**：若相似度超过 0.65，系统弹出“智能匹配建议”对话框，用户一键确认即可完成全篇身份替换。

#### 3. 数据一致性级联更新 (Cascading Update)
针对“姓名修改”这一高频场景，系统实现了**跨表级联同步**：
- 用户在 `Voiceprint.vue` 修改名称。
- 后端更新声纹库主表。
- 后端自动扫描并更新 `DialogueSegment`（对话历史）与 `Split`（切分记录）中所有匹配该旧名称的字段。
- 前端通过状态刷新确保库中记录与详情页显示实时对齐。

### 3.11 全局自研高级模态框 (Premium Overlays) 指南

**设计哲学**：为了维持“Gemini SaaS”极简审美，系统全面弃用了 Element Plus 默认的 `ElMessageBox`。

#### 实现技术栈
- **Transition**: `confirm-fade` 过渡动画（透明度 + 缩放）。
- **Backdrop**: `backdrop-filter: blur(4px)` 高性能模糊遮罩。
- **Scoped Store**: 在各页面组件内维护 `confirmDialog` 响应式对象，支持动态标题、消息、确认按钮文本及回调函数 (`onConfirm`)。

#### 核心优势
1. **非阻塞式操作**：配合 `async/await`，在确认后无感执行 API 请求并刷新视图。
2. **沉浸式体验**：弹窗居中对齐，背景模糊保留了当前页面的上下文感，减少了用户的心理中断压力。

### 3.12 内联文本编辑逻辑

Detail.vue 实现了"气泡原地编辑"交互，无需弹窗，直接在文本显示区域切换编辑态。

#### 触发机制

```html
<!-- 鼠标悬浮气泡时，右下角显示编辑图标（opacity: 0 → 1） -->
<div class="edit-btn-wrapper" @click.stop="editSegment(item)">
  <el-icon class="edit-icon"><Edit /></el-icon>
</div>
```

#### 编辑模式切换

```js
const editSegment = (item) => {
  item.isEditing = true          // 切换至编辑态（非响应式字段，直接变异对象属性）
  item.editText = item.text      // 初始化编辑缓存：将原始文本复制到 editText
}

const cancelEdit = (item) => {
  item.isEditing = false         // 恢复展示态，editText 丢弃
}
```

#### 双向数据绑定变量

```html
<!-- 编辑态：自动伸缩 textarea，绑定中间态变量 item.editText -->
<el-input
  v-model="item.editText"        <!-- 双向绑定：item.editText -->
  type="textarea"
  autosize
/>
```

**设计要点**：使用 `item.editText` 作为中间缓冲，而非直接绑定 `item.text`，保证取消时可以无损恢复。

#### 保存逻辑与 API 调用

```js
const saveEdit = async (item, index) => {
  // 防空校验
  if (!item.editText || item.editText.trim() === '') { ElMessage.warning('文本不能为空'); return }
  // 无变化时直接取消
  if (item.editText === item.text) { cancelEdit(item); return }

  item.isSaving = true
  try {
    // PUT /record/{recordId}/segment/{index}  Payload: { text: item.editText }
    await updateSegmentText(route.params.id, index, item.editText)
    // 后端成功后，才将视图层 item.text 更新（乐观锁逻辑：以服务端为准）
    item.text = item.editText
    item.isEditing = false
    ElMessage.success('修改已保存')
  } catch (e) {
    // 错误已由 request.js 响应拦截器统一 ElMessage.error 提示
  } finally {
    item.isSaving = false
  }
}
```

**请求参数结构**：
- **URL**：`PUT /record/{route.params.id}/segment/{index}`  
- **Payload**：`{ text: "修改后的转录文本内容..." }`  
- **视图更新时机**：仅在服务端返回成功后，执行 `item.text = item.editText`，避免接口失败时 UI 残留错误数据。

---

## 4. 视图与组件树

### 4.1 路由配置 (`src/router/index.js`)

```
/ (Layout.vue - 后台框架壳)
├── /dashboard          → Dashboard.vue （工作台）
├── /history            → History.vue   （历史记录列表）
├── /detail/:id         → Detail.vue    （音文对齐详情页 + 声纹识别入口）
├── /transcript-check/:id → TranscriptCheck.vue （AI 质检报告页）
└── /voiceprint         → Voiceprint.vue （发音人特征管理库）

/login                  → Login.vue     （独立登录页，无 Layout 嵌套）
```

**全局路由守卫**：`router.beforeEach` 拦截所有非 `/login` 路由，若 `userStore.token` 为空则强制重定向至 `/login`。

---

### 4.2 核心组件树

```
App.vue
└── <RouterView>
    ├── Login.vue（独立全屏页）
    │     └── Canvas 正弦波动画（左侧品牌区）
    │         登录/注册表单（右侧）
    │
    └── Layout.vue（后台框架壳）
          ├── <aside> 深色侧边栏
          │     └── <router-link> × 2（工作台、历史记录）
          ├── <header> 顶部面包屑 + 用户下拉菜单
          │     └── userStore.username 显示
          └── <main> 内容区（overflow-y: auto）
                └── <RouterView>（子页面挂载点）
                      ├── Dashboard.vue
                      │     ├── <DashboardStatusBar />（区块一：引擎状态舱）
                      │     ├── 区块二：数据速览卡片 × 3 + 上传/处理台（互斥渲染）
                      │     └── 区块三：词云 + 最近转录列表（Top 5）
                      │
                      ├── History.vue
                      │     └── el-table（历史记录列表，带删除、跳转按钮）
                      │
                      ├── Detail.vue（三段式分层架构）
                      │     ├── Header: 动态元数据中台（支持标题修改与时间同步）
                      │     ├── Main: 气泡流分析区（支持 Wavesurfer 声纹取证播放）
                      │     └── Trigger: 自研 CustomConfirm 高级确认模态框
                      │
                      ├── TranscriptCheck.vue（双栏 AI 质检视图）
                      │     ├── .transcript-panel（剧本溯源区）
                      │     └── .summary-panel（LLM 多维度总结展示区）
                      │
                      └── Voiceprint.vue（声纹特征管理舱）
                            ├── 发音人卡片网格 (Renaming/Deletion/History)
                            ├── EnrollDialog (录音/上传入库)
                            └── HistoryDrawer (身份活动追溯轴)
```

---

### 4.3 `DashboardStatusBar.vue` — 顶部状态舱组件

**职责**：独立封装 Dashboard 顶部的问候语、环境信息（天气/地区）、引擎在线状态展示。

**数据获取**（并行、容错）：
```js
const [ambientResult, healthResult] = await Promise.allSettled([
  getDashboardAmbient(),  // GET /api/dashboard/ambient
  getDashboardHealth(),   // GET /api/dashboard/health
])
// 任意一个失败不影响另一个渲染
```

**三态引擎状态指示灯**：
- 加载中：灰色脉冲点（`bg-slate-300 animate-pulse`）
- 在线：绿色呼吸动画（`bg-emerald-500` + `animate-ping`）
- 离线：玫红色静态点（`bg-rose-500`）

---

### 4.4 `TranscriptCheck.vue` — AI 质检双栏布局与数据流

#### 左侧剧本面板（始终显示）

```js
const segments = ref([])
// fetchDetail() 调用 getTranscriptData(id) → GET /api/transcript_data/:id
// 优先读取 data.display_data（后端格式化好的对话数据）
// 每条记录: { side: 'left'|'right', text: string }
```

HTML 渲染：
```html
<div v-for="(item, index) in segments">
  <span class="role-badge" :class="item.side === 'left' ? 'role-badge-a' : 'role-badge-b'">
    {{ item.side === 'left' ? '角 色 A' : '角 色 B' }}
  </span>
  <div class="text-district">{{ item.text }}</div>
</div>
```

#### 右侧 AI 侧写面板（触发后显示，条件渲染）

**触发事件**：用户点击底部"确认无误，生成 AI 心理侧写"按钮 → `handleSummary()`

**完整数据流向**：

```
用户点击按钮
    → handleSummary()
    → generateSummary(id)  [POST /api/summary/:id, timeout=300s]
    → 后端 LLM 推理（等待...）
    → 返回原始响应 res

    ┌─────────────────────────────────────────────────────────────────┐
    │ 数据解包（多层嵌套剥离）                                           │
    │  res = { code:200, data: { summary: { summary: { ... } } } }   │
    │  businessData = res?.data                                       │
    │  layer1 = businessData?.summary                                 │
    │  targetData = layer1?.summary                                   │
    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │ 数据清洗与规范化                                                   │
    │  overview 兼容 string | object 两种格式                           │
    │  analysis_breakdown 兼容 role_0/role_A、role_1/role_B 两种键名   │
    └─────────────────────────────────────────────────────────────────┘

    → summaryData.value = {
        overview: {
          scene_type: '...',          // → el-tag 场景定性标签
          detailed_summary: '...'     // → 描述性文本块
        },
        analysis_breakdown: {
          role_0: {
            role_label: '...',        // → el-tag
            emotional_state: '...',   // → span.emotional-state
            hidden_intent: '...',     // → blockquote.intent-quote
            VFA_analysis: {
              viewpoint: '...',       // → div.vfa-viewpoint
              facts: ['...', '...'],  // → ul.fact-list（v-for 循环）
              deep_analysis: '...'    // → div.deep-analysis
            }
          },
          role_1: { ... }  // 结构同 role_0
        }
      }

    → hasSummary.value = true         // 控制右侧面板显示
    → transcript-panel 添加 .half-width 类（CSS flex: 4，宽度收窄）
    → summary-panel 出现（flex: 6，占 60% 宽度）
```

**VFA 结构化数据绑定到视图的完整映射**：

| JSON 路径 | 绑定目标 | UI 组件 |
|-----------|---------|---------|
| `summaryData.overview.scene_type` | `{{ summaryData.overview?.scene_type }}` | `<el-tag effect="dark" type="danger">` |
| `summaryData.overview.detailed_summary` | `{{ summaryData.overview?.detailed_summary }}` | `.detailed-summary-box` |
| `summaryData.analysis_breakdown.role_0.role_label` | `el-tag` | `<el-descriptions-item label="角色定性">` |
| `summaryData.analysis_breakdown.role_0.emotional_state` | `span.emotional-state` | `<el-descriptions-item label="情绪动线">` |
| `summaryData.analysis_breakdown.role_0.hidden_intent` | `blockquote.intent-quote` | `<el-descriptions-item label="隐性意图">` |
| `summaryData.analysis_breakdown.role_0.VFA_analysis.viewpoint` | `div.vfa-viewpoint` | 靛蓝左竖线装饰块 |
| `summaryData.analysis_breakdown.role_0.VFA_analysis.facts` | `v-for` 循环 | `<ul class="fact-list"><li>` |
| `summaryData.analysis_breakdown.role_0.VFA_analysis.deep_analysis` | `div.deep-analysis` | 灰底圆角文本块 |
| （role_1 同 role_0 结构） | `el-tabs` 第二面板 | `<el-tab-pane label="角色 1 (Spk1)">` |

---

## 5. 系统前端架构总览

### 5.1 整体架构分层图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器 (Browser)                       │
├──────────────────────────────────────────┬──────────────────────┤
│          视图层 (View Layer)              │   状态层 (State Layer) │
│  Vue 3 SFC + Element Plus + TailwindCSS  │     Pinia Stores      │
│                                          │  ┌──────────────────┐ │
│  ┌──────────┐  ┌──────────┐              │  │  useUserStore    │ │
│  │ Login.vue│  │Layout.vue│              │  │  token, username │ │
│  └──────────┘  └────┬─────┘              │  └──────────────────┘ │
│            ┌───────┼────────────────┐    │  ┌──────────────────┐ │
│    ┌───────┴┐  ┌───┴──┐  ┌────────┐│    │  │  useTaskStore    │ │
│    │Dash-   │  │Detail│  │Trans-  ││    │  │  tasks[]         │ │
│    │board   │  │.vue  │  │cript   ││    │  └──────────────────┘ │
│    │.vue    │  │      │  │Check   ││    │                        │
│    └────────┘  └──────┘  └────────┘│    │                        │
├──────────────────────────────────────────┴──────────────────────┤
│                    API 层 (API Layer)                             │
│              src/api/request.js  + src/api/audio.js              │
│   Axios 单例 | 请求拦截（JWT注入）| 响应拦截（401处理/业务判断）     │
├──────────────────────────────────────────────────────────────────┤
│                  路由层 (Router Layer)                             │
│         vue-router 4 | History Mode | beforeEach 全局守卫          │
└──────────────────────────────────────────────────────────────────┘
                          HTTP/REST
                    ↕   (localhost:5000)
┌─────────────────────────────────────────────────────────────────┐
│                    Flask 后端服务 (Backend)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 核心功能点汇总

| 功能模块 | 实现方案 | 关键技术点 |
|---------|---------|-----------|
| **用户认证** | JWT Token，持久化至 localStorage | Pinia userStore + Axios 请求拦截器自动注入 |
| **全局守卫** | router.beforeEach 鉴权 | userStore.token 判空，未登录重定向 |
| **音频上传** | FormData + POST /upload | 非阻塞，立即返回 record_id |
| **任务队列** | Pinia taskStore.tasks[] | addTask/updateTask/removeTask 响应式驱动 |
| **Dashboard 轮询** | setInterval(checkStatus, 1000) | 过滤活跃任务，终态后停止更新 |
| **Detail 轮询** | setInterval(fetchDetail, 2000) | 首次请求非成功时启动，成功/失败后 clearInterval |
| **伪进度条** | fakeProgressInterval(100ms) 阻尼算法 | 三段式：上传→排队→处理，指数收敛至 99% |
| **音文对齐播放** | 原生 Audio API 实例 + timeupdate 事件 | 每段独立切分音频文件，el-slider 同步进度 |
| **内联文本编辑** | item.editText 中间缓冲变量 | 点击Edit图标进入编辑态，PUT API 持久化后更新视图 |
| **AI 质检报告** | generateSummary (timeout=300s) | 多层 JSON 解包，兼容两种键名格式，双栏互斥布局 |
| **声纹匹配映射** | applyVoiceprintMapping | `raw_spk` (e.g. spk0) 到实名姓名的全局映射应用 |
| **级联名更** | updateVoiceprint | 实现声纹库与全量通话记录的姓名同步 |
| **视觉一致性** | Custom Transition Overlays | 全栈自研确认模态框，实现全系统沉浸式交互 |
| **引擎状态监控** | Promise.allSettled 并行请求 | 任一失败不影响另一模块渲染，三态指示灯 |
| **响应式分屏** | CSS flex + hasSummary 控制类 | .half-width → flex:4 / summary-panel → flex:6 |

### 5.3 关键数据流时序（上传→转写→详情）

```
用户拖拽/选择音频文件
    → handleUpload()
    → uploadAudio(file) → POST /upload
    ← { record_id, status: 'pending' }
    → taskStore.addTask({ record_id, status: 'pending', progress: 0 })

Dashboard 轮询（每 1s）:
    → checkStatus() → getDetail(record_id)
    ← { status: 'processing', current_stage: '...', progress: 45 }
    → taskStore.updateTask(id, { status, current_stage, progress })
    → 伪进度条 fakeProgress 同步逼近
    （循环直到 status === 'success'）

用户点击"查看"跳转:
    → router.push(`/detail/${record_id}`)
    → Detail.vue onMounted → fetchDetail()
    ← { status: 'success', segments: [...] }
    → info.value = data; recordStatus.value = 'success'
    → 渲染聊天气泡流 + 右侧播放器

用户点击气泡（音文对齐）:
    → togglePlay(segment)
    → audioElement.src = getAudioUrl(segment.path)
    → audioElement.play()
    → timeupdate → currentTime.value 同步
    → el-slider 实时展示播放进度
```

### 5.4 开发历程脉络（参考 development.md）

| 阶段 | 主要变更 |
|------|---------|
| **初始化** | Vite + Vue 3，集成 Element Plus、Axios |
| **架构升级** | 引入 Vue Router 4、Pinia，拆分多页面 |
| **异步架构** | 非阻塞上传 + 任务队列 + Dashboard/Detail 双轮询 |
| **功能扩展** | DeleteRecord、TranscriptCheck 页面、内联编辑 |
| **UI 重构 ×4** | Login 企业级重构 → Glassmorphism → Prodify → Gemini SaaS 风格定型 |
| **Dashboard 完善** | DashboardStatusBar 组件、Stats/Keywords/RecentRecords API 对接 |
| **声纹系统集成** | Voiceprint 核心链路调通：录制→特征提取→相似度匹配→全局应用 |
| **交互深度优化** | 自研 Premium Overlays，实现 100% 定制化交互，适配毕业论文演示 |
| **当前稳态** | Gemini 专业级 B 端 AI 控制台，具备完整的“声纹识别+四川话转写+AI总结”能力 |

---

> **附注**：本报告所有代码段均直接来源于源码扫描，可直接引用至论文代码清单。VFA 数据结构（Viewpoint-Fact-Analysis）为后端 LLM 的结构化输出格式，前端的兼容清洗逻辑（`handleSummary` 函数中的多层解包与 role_0/role_A 键名兼容）反映了真实生产环境中前后端接口协商的迭代痕迹。
