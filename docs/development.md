# 四川话方言语音分析前端开发文档

## 项目概览
- 项目名称：`ASR-frontend`
- 目标：为四川话方言语音分析打造现代化控制台，支持拖拽上传音频，展示分段识别结果并逐段原音播放。
- 在线预览：`http://localhost:5173/`

## 技术栈
- 构建工具：`Vite`
- 框架：`Vue 3`（Composition API，`<script setup>`）
- UI 库：`Element Plus`
- HTTP 客户端：`Axios`
- 样式：使用 Element Plus 默认样式；如需 `TailwindCSS` 可后续集成。

## 项目结构
```
frontend/
  src/
    App.vue                ← 路由根容器（router-view）
    api/
      request.js           ← Axios 实例与响应拦截器
      audio.js             ← 音频上传 API 封装
    assets/
      main.css             ← 全局样式变量与设计规范
    components/            ← 业务组件
    main.js                ← 应用入口，注册 Element Plus、Icons、CSS
    router/                ← 路由配置与守卫
    stores/                ← Pinia 状态
    views/
      Login.vue            ← 现代化登录页
      Layout.vue           ← 后台框架（深色侧边栏+白色顶部）
      Dashboard.vue        ← 工作台（大尺寸拖拽上传）
      History.vue          ← 历史记录列表
      Detail.vue           ← 详情页（左侧聊天流 + 右侧控制台）
  vite.config.js           ← Vite 配置与 @ 别名
  docs/development.md      ← 开发文档
```

## UI 设计系统
- **配色**：
  - Primary: `#409EFF`
  - Background: `#F5F7FA`
  - Surface: `#FFFFFF`
  - Chat Bubbles: Left `#F3F4F6`, Right `#95EC69`
- **字体**：Inter, PingFang SC, Helvetica Neue
- **图标**：`@element-plus/icons-vue` 全局注册

## 架构设计
- UI 层：基于 Element Plus 布局，深度定制样式。
  - **Layout**：固定侧边栏 (`#001529`)，顶部面包屑与用户菜单。
  - **Detail**：双栏自适应布局。左侧聊天流 (Scrollable)，右侧固定控制台 (Sticky)，支持点击气泡自动跳转并播放对应音频片段。
- API 层：`src/api` 统一封装。
- 状态管理：Pinia (`src/stores`)。
- 路由系统：`vue-router`。

## 前后端交互约定
- 基地址：`http://localhost:5000`
- 上传接口：`POST /upload` -> `{ record_id, status: 'pending' }` (非阻塞)
- 查询详情：`GET /record/:id` -> `{ status, segments: [...] }`
- 历史列表：`GET /history`
- 删除记录：`DELETE /record/:id`
- 认证：`POST /auth/login`

## 异步架构与轮询机制 (Async & Polling)
为适配后端异步处理流程，前端实现了以下机制：

### 1. Dashboard (工作台)
- **非阻塞上传**：上传文件后立即返回 `record_id`，不再全屏 Loading。
- **任务队列**：上传成功后，任务加入页面下方的“处理队列”列表。
- **状态轮询**：
  - 组件挂载时 (`onMounted`) 启动轮询器 (`setInterval`)，每 2 秒查询一次状态。
  - 仅针对状态为 `pending` 或 `processing` 的任务调用 `getDetail`。
  - 组件销毁时 (`onUnmounted`) 自动清除定时器。
- **状态可视化**：
  - `pending/processing`: 显示加载动画与进度条。
  - `success`: 显示“查看”按钮。
  - `failed`: 显示错误提示。

### 2. Detail (详情页)
- **状态自适应**：进入页面时检查记录状态。
- **加载态**：若状态为 `pending/processing`，显示全屏 Loading 并开启轮询，直到状态变更为 `success` 或 `failed`。
- **错误态**：若状态为 `failed`，展示 `el-result` 错误页。
- **完成态**：若状态为 `success`，展示聊天流与播放器。

### 3. History (历史记录)
- **状态列**：根据 `status` 显示不同颜色的 Tag (Success=Green, Processing=Blue, Failed=Red)。
- **删除功能**：支持删除记录，操作前需二次确认。

## 变更记录
- 初始化：Vite + Vue 3 项目，集成 Element Plus 与 Axios。
- 架构升级：引入 Router、Pinia，拆分页面。
- 用户流程重构：Dashboard -> Detail 跳转，History -> Detail 跳转。
- UI/UX 全面重构：建立设计系统，重构核心页面布局。
- **异步架构升级 (Current)**：
  - 支持非阻塞上传与任务队列管理。
  - 实现 Dashboard 与 Detail 页面的状态轮询机制。
  - 新增删除功能与状态可视化。
  - API 层适配 `deleteRecord` 与 `status` 字段。
- **对话文本核查页 (TranscriptCheck)**:
  - 新增 `/transcript-check/:id` 路由与页面。
  - 实现左右分栏的剧本式对话预览，纯净展示文本。
  - **[NEW] 增加 AI 总结呼叫与报告展示：接入大模型返回的数据后，实现动态左右分屏。右侧面板精心设计为两块核心分析区（场景总览、VFA角色深度侧写），结合 Tabs 降低信息密度，高度结构化展示后端复杂 JSON 返回体。**
- **Detail 页内联编辑与更正 (Inline Edit)**:
  - 在聊天流气泡中新增对识别不准的转录文本进行原位修改的功能。
  - 实现编辑模式（带自动伸缩输入框）与展示模式之间的平滑切换。
  - 增加 `updateSegmentText` PUT 接口，实现分段文本的后端持久化保存。
  - 做了样式适配，确保用户即可边听录音边修改文本。

- **Login.vue 企业级全面重构（三轮迭代，2026-03-08）**：
  - **R1 - 分栏布局**：彻底废弃居中小卡片式设计，改为全屏左右分栏（`flex: 5.5 / 4.5`）。
    - 左侧：深色科技感品牌区，Canvas 正弦波动画（4条，`requestAnimationFrame`），品牌 Slogan、SVG 麦克风图标。
    - 右侧：表单操作区，原生 `<input>` 替代 Element Plus，自实现 Focus 光晕交互，密码显示/隐藏切换。
    - 保留全部原有登录/注册逻辑不变。
  - **R2 - 文案汉化**：Logo "ASR Platform" → "川方言·智能语音质检系统"；功能标签去 Emoji；标题改"欢迎登录"；右侧背景 `#f8fafc`；左侧 `box-shadow` 投影增强层级感。
  - **R3 - 去 AI 玩具化（当前）**：
    - 颜色：左侧背景改藏青色 `#0f172a → #1e293b`（去紫色调）；按钮改政务蓝 `#1d4ed8`；输入框 Focus 光晕改低饱和蓝 `rgba(29,78,216,0.10)`。
    - 几何：所有交互元素 `border-radius ≤ 3px`，消除药丸形大圆角。
    - 视觉降噪：功能标签去 Emoji，改为 SVG 线稿图标（麦克风、CPU、柱状图）。
    - 响应式：`@media (max-width: 1024px)` 左右各 `flex: 1` 并缩小字号；`@media (max-width: 768px)` 隐藏左侧面板，右侧占满屏。

## 后续规划（建议）
- 接入 `TailwindCSS` 以增强布局与响应式设计。
- 引入持久化或路由，用于历史记录与多页面导航。
- 表格增强：分页、排序、筛选、导出 CSV。
- WebSocket 集成：若需更实时状态更新，可升级轮询为 WebSocket 推送。
