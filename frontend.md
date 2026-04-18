# 前端工程架构与交互深度报告 (ASR-Frontend)

## 1. 全局状态管理 (Pinia Stores)
前端状态管理统一采用基于 Vue 3 的 Pinia 库，位于 `src/stores` 目录下。共分为两个核心模块：

### 1.1 `user.js` (用户鉴权状态)
- **State 变量**: 
  - `token`：保存用户的 JWT Token，初始值通过读取 `localStorage.getItem('token')` 获取，未登录则为 `''`。
  - `username`：保存当前登录的用户名，也从 `localStorage` 回显。
- **核心 Actions**:
  - `login({ username, password })`：发起 POST `/auth/login` 请求验证，成功后将返回的 `token` 同步至 State 和 localStorage 中。
  - `register({ username, password })`：发起注册请求。
  - `logout()`：清除 Store 内的 `token` 及 `username` 状态，并同步清理 `localStorage` 的相应缓存。

### 1.2 `task.js` (核心任务队列管理)
- **State 变量**: 
  - `tasks`：一个响应式数组 `ref([])`，用于保存并展示各记录（例如正在转写的任务列表）的状态信息。对于轮询场景尤其重要。
- **核心 Actions**:
  - `addTask(task)`：向 `tasks` 数组头部 (`unshift`) 插入新任务。
  - `updateTask(id, info)`：根据 `record_id` 查找目标任务，并通过 `Object.assign` 合并更新的 `info` 数据，以此实现任务进度管理。
  - `removeTask(id)`：根据 `record_id` 将任务从列表中移除。

---

## 2. 核心 API 封装与请求层 (Axios & API Interceptors)
系统基于 Axios 创建了隔离的 `request.js` 服务实例（BaseURL 指向 `http://localhost:5000`），并提供统一的错误处理。

### 2.1 请求拦截与鉴权
- **请求拦截器 (Request Interceptor)**: 在请求发出前，拦截器会自动读取 `pinia` 挂载的 `userStore`。若 `userStore.token` 存在，则自动在 headers 中添加 `Authorization: Bearer ${userStore.token}` 携带 JWT Token。
- **响应拦截器 (Response Interceptor)**:
  - 正常业务：当 `res.code !== 200` 且 `res.success !== true` 时会被判定为业务执行失败（Promise.reject）。
  - 全局异常：当 HTTP 状态码返回 `401` (Unauthorized) 时，拦截器会自动触发 `userStore.logout()` 清除前端状态，并利用 `location.assign('/login')` 强制重定向至登录页面。

### 2.2 前端 API 调用封装 (`audio.js`)
封装了所有音视频有关操作，函数签名及入参如下：
- `uploadAudio(file)`: POST `/upload`，入参包装成 `FormData`，包含 `file` 文件流。
- `getDetail(id)`: GET `/record/${id}`，获取音视频转录详情。
- `deleteRecord(id)`: DELETE `/record/${id}`，依据给定的任务 ID 删除对应任务记录。
- `getTranscriptData(id)`: GET `/api/transcript_data/${id}`，获取转写结果结构化数据。
- `updateSegmentText(recordId, segmentIndex, text)`: PUT `/record/${recordId}/segment/${segmentIndex}`，编辑对话文本。请求 payload 结构为 `{ text }` 文本字段。
- `generateSummary(id)`: POST `/api/summary/${id}`，触发 AI 侧写生成，请求 payload 为且仅为 `{}` (空对象)，并携带长达 300000ms 的长超时配置。
- **Dashboard 数据接口**: `getDashboardAmbient()`、`getDashboardHealth()`、`getDashboardStats()`、`getDashboardKeywords()`、`getDashboardRecentRecords()` 分别对应大盘的环境、健康值、数据统计、关键词以及最近记录。

---

## 3. 复杂交互逻辑剖析 (Complex Interactions)

### 3.1 异步任务轮询与进度算法
系统针对上传并在后台处于转录处理状态任务，实施了双重轮询策略机制。
- **触发条件**: 
  - 在 `Dashboard.vue` 中，当存在状态为 `pending` 或 `processing` 的 activeTask 时，挂载的 `setInterval(checkStatus, 1000)` 1 秒轮询器开始针对任务队列调用 API；
  - 在 `Detail.vue` 中，当首次获取详情返回状态不是成功失败，而是 `pending` 时，触发 `setInterval(fetchDetail, 2000)` 2 秒周期轮询。
- **停止判定 (clearInterval)**: 
  - 在状态更新判定为 `['success', 'failed'].includes(t.status)` 时，执行状态覆写（并强制进度 100%），调用 `clearInterval(pollTimer)` 停止轮询。
- **“阻尼减速”伪进度条算法**: 
  - 核心在 `Dashboard.vue` 内 `setInterval(..., 100)`：
    - `fakeProgress.value` 在 `pending` 阶段递增较快，最高逼近 35%，然后等待调度。
    - 进入 `processing` 转录阶段，采用**阻尼渐进策略**算法 `const diff = 99 - fakeProgress.value; const increment = Math.max(0.01, diff * 0.005);` 进度随时间增长由于 diff 不断减小而发生递减，造成逼近 99% 的指数级折迭效果，保证在引擎实际未完全成功前“永远差一丁点”。一旦服务端反馈 status=success，它会瞬间拉升到 100%。

### 3.2 HTML5 媒体控制与音文对齐
在 `Detail.vue` 界面提供了富文本与下挂控制器的联动：
- **触发函数签名**: `const togglePlay = async (segment) => { ... }`，点击后更新全局 `currentPlayingId`、`currentId` 标识及 HTML Audio API。
- **媒体播放与精确控制**:
  - 前端实例化的原生 `const audioElement = new Audio()` 来做媒体渲染。
  - 获取 `segment.path` 通过 `getAudioUrl` 工具拼接真实音频路径赋值给 `audioElement.src` 并交由 `.play()` / `.pause()` 释放。虽然片段上带有 `start_time` / `end_time`（组件内以 `item.start` / `item.end` 命名），该设计采用的是基于服务器单独切分好的路径播放形式来规避单大文件 `currentTime` Seek 性能的损耗；在播放某一段期间，监听 `audioElement.addEventListener('timeupdate')` 来同步设置 UI 进度条的 `currentTime` 和 `duration`。

### 3.3 内联文本编辑逻辑
- 触发方式：在文本视图中提供了内嵌编辑逻辑，点击笔形 Icon 开始编辑状态触发 `editSegment(item)`。
- **双向数据绑定变量**: 组件内绑定的中间态变量是 `item.editText`，即 `v-model="item.editText"`。
- **保存与请求 Payload**: 确认保存时触发 `saveEdit(item, index)` 函数，内部调用底层 `updateSegmentText(route.params.id, index, item.editText)` API。调用的方法名为 `PUT` HTTP 原语，最终构建的 Payload 为 `{ text: '修改后的结果...' }`。请求落库成功后，才会正向同步覆盖 `item.text = item.editText` 将视图层更新。

---

## 4. 视图与组件树 (Component Tree)
在 `src/views` 目录下构建了核心的工作台功能与展示分析界面：
- **`Dashboard.vue`**: 工作台门户大屏。
  - 引用了局部组件 `<DashboardStatusBar />` 用作顶部运行状态环境舱。内部直接集成了 Bento 风格卡片网格系统，统筹左侧数据速览、右侧上传进度槽口，及底部近期记录词云概貌。
- **`Detail.vue`**: 音频逐句核阅。 
  - 采用一栏式左右切割结构，不依赖特殊外部子组件，内部构建 “会话片段气泡 (Chat Bubble)” 及全局悬浮的 “片段点查视界 (Right Control Panel)”，集成 `Audio` API 视图流。
- **`TranscriptCheck.vue`**: 具备双分栏结构的 **VFA大字剧本审查/AI总结阅卷** 系统页面。
  - **右侧 AI 数据映射分析 (VFA 结构)**: 前端点击生成并接收到总结后，会对多层嵌套的 JSON 返回进行预清洗提取到 `targetData`，并落脚到 `summaryData` 反应栈内。接着触发左栏变窄（`half-width`），显示出右侧的 `summary-panel` 容器。
  - **数据流向与视图渲染**: 右侧由多个卡片（`el-card`, `el-tabs`）进行绑定。`summaryData.overview.scene_type` 直接插入为场景定性标签的文案；基于 `el-tabs` 构建的两个面板，分别响应 `role_0` 与 `role_1` 两维度。`summaryData.analysis_breakdown.role_0.VFA_analysis` 的 `viewpoint` (定点)、`facts` (陈述/事实列证 - v-for循环输出)、`deep_analysis` (深入分析) 一级级响应投射到 DOM 层级，通过不同样式实现了心理侧写层面的结构化布局呈现。
