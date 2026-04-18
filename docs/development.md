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

- **Dashboard 区块一：顶部环境与引擎状态舱 (2026-03-16)**：
  - 新建 `src/components/DashboardStatusBar.vue` 组件。
  - **Script 层**：
    - 接入 `useUserStore` 读取已登录用户名，动态拼接分时问候语（凌晨/上午/中午/下午/晚上好）。
    - `currentDate` 计算属性格式化为 `YYYY年M月D日`。
    - `Promise.allSettled` 并行请求 `/api/dashboard/ambient` 和 `/api/dashboard/health`，任意一个失败不影响另一个。
    - 加入 `loadingAmbient` / `loadingHealth` 状态，控制骨架屏 / 真实数据的切换渲染。
    - 数据解构加 `?? '默认值'` 防御，防止接口字段缺失导致页面空白。
  - **Template 层**：
    - 左侧：大字问候语 + 次级信息栏（日期 | 地区·天气·温度 | 运行时长），加载中显示 `animate-pulse` 骨架条。
    - 右侧：两个引擎状态胶囊，三态设计（加载中灰脉冲→在线绿灯呼吸动画→离线红灯）。
  - **API 层**：`audio.js` 新增 `getDashboardAmbient` / `getDashboardHealth` 两个封装函数。
  - **集成**：`Dashboard.vue` 顶部引入并渲染，替换原有静态欢迎标题。

- **Dashboard 区块二：核心业务与控制台 API 对接与真实交互开发 (2026-03-16)**：
  - **真实状态获取 (Stats API)**：
    - `api/audio.js` 新增 `getDashboardStats` 方法对接 `GET /api/dashboard/stats`。
    - `Dashboard.vue` 中的 `stats` 修改为实际数据字段 (`total_transcribed`, `total_summarized`, `uptime_hours`)。
    - 在 `onMounted` 添加异步 `fetchDashboardStats` 方法，带完整 `try/catch` 避免请求异常时应用白屏挂掉，保持默认 `0` 兜底。
  - **拖拽上传真实交互 (Drag & Drop)**：
    - 增加 `isDragging` 引用型状态。
    - 给 Dropzone 绑定 `:class` 动态切换样式。`isDragging` 为 true 时启用 `border-indigo-500 bg-indigo-50` 的醒目拖拽反馈；默认应用 `border-slate-300 bg-slate-50/50 hover:bg-slate-100`。
    - `handleDragOver` 触发 `isDragging = true`，补全 `handleDragLeave` 触发 `isDragging = false`。
    - `handleDrop` 中关闭拖拽状态并拦截 `dataTransfer.files`，加入对 `audio/*` mime types 的强校验和 `console.log` 调试打印抛出。

- **Dashboard 区块三：近期对话焦点与历史记录 (2026-03-16)**：
  - **API 对接**：`api/audio.js` 新增 `getDashboardKeywords` / `getDashboardRecentRecords` 接口封装。组件内新增 `fetchDashboardThree` 方法调用双接口。
  - **左侧 1/2 — 对话焦点词云**：
    - 绑定 `keywords` 状态。在无数据时显示“暂无足够的对话数据提取焦点”作为友好空状态。
    - 用 `<span v-for>` 遍历词汇，动态绑定 `:style="{ fontSize: ... }"` 限制字号区间在 14px~28px 以模拟初级词云大小差异，并通过 `index % 3` 引入 `text-indigo-500` / `text-slate-700` / `text-slate-500` 的穿插变色。
    - 添加 `hover:scale-110` 微小过渡动效交互。
  - **右侧 1/2 — 历史记录列表 (Top 5)**：
    - 绑定 `recentRecords` 状态。包含右上角“查看全部”跳转按钮 (通过 `router.push('/history')`)。
    - 列表容器为每条展示渲染行高、极简 SVG Icon 和横向分隔线 `border-b`，带 `group-hover:text-indigo-500`。
    - 新增 **getStatusClass(status)** 函数精细映射四种底层状态码到对应的低饱和度 Tailwind 颜色池标签：
      - success = emerald (绿)
      - processing/pending = amber (橙黄)
      - failed = rose (粉红)
  - **调整**：原来的队列处理区重命名为【区块四：处理队列】，逻辑及条件渲染未变。

- **Dashboard 核心交互重构：内联处理态与底部减负 (2026-03-17)**：
  - **移除底部负担**：彻底删除了页面底部的 `el-table` "区块四：处理队列"。Dashboard 结构重新变回极其凝练的三层网格结构。
  - **内嵌处理看板 (互斥渲染)**：在区块二右侧的“语音案卷处理台”，基于计算属性 `isProcessing` (综合 `isUploading` 和队列 `activeTask` 判断) 实现了“空闲上传区”与“进度处理区”的平滑互斥：
    - `v-if="!isProcessing"`：显示原先的虚线拖拽上传窗。
    - `v-else`：原地展示专属的科技感加载看板，含外圈随动光环 (`animate-spin`)、内圈脉冲 Logo (`animate-pulse`)，以及响应式状态提示文本。
  - **进度条实现与 Tailwind 深度定制**：
    - 将底部生硬的任务表单转换成了 `Tailwind` 纯 CSS 绘制的绝美进度条骨架：底色 `bg-slate-200`，满血注水 `bg-indigo-600 transition-all duration-300`。
    - 添加高级动画：通过内联渐变黑白相间斜纹与 `@keyframe barberpole` 实现进度条“理发店旋灯”式的动态滑行效果，极大地提升了处理等待期间的视觉沉浸感。
    - **“伪满减缓”进度心理学 (User Patience)**：为解决冗长的 AI 模型推理导致的“死锁感”，在原有逻辑上新增了一套 `fakeProgressInterval` 滴答算法。在实际进度未返回时，进度不仅会继续往前走，还会采用平滑的阻尼减速算法（逼近 99% 时增量无限趋近，像真实的下载效果），直到真数据顶替或者处理成功。以提升等候者的用户耐心。
- **全系统级 UI 重构：深色模式与磨砂玻璃质感统合 (Glassmorphism) (2026-03-19)**：
  - 弃用所有的 Element Plus 默认 `el-container` 和浅色卡片。
  - **Layout.vue 改造**：将 `Login.vue` 的底层 Canvas 动态波形代码复刻至根容器，辅以 `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900` 的全屏渐变铺底。使用纯 Tailwind 实现了左侧深色导航栏 (`v-slot` 自定义高亮) 和顶部毛玻璃 Header。
  - **Dashboard.vue 改造**：所有业务卡片（核心数据、案卷台、近期焦点、转录记录）全部升级为白金版毛玻璃：`bg-white/5 backdrop-blur-md border-[0.5px] border-white/10 rounded shadow-xl`。剥除了所有的白底黑字，适配了各种通透的低饱和度白字、灰字、带透明靛蓝高亮，以及 `emerald-400` 等发光态 Badge，使得处理台的体验上升到了 Next-Gen 的级别。
- **全盘重构：Dribbble 顶级机构 Phenomenon Studio "Prodify AI Dashboard" 风格大一统 (2026-03-19)**：
  - **极致空间感：** 将大背景彻底切换为浅蓝灰 `bg-[#F8FAFC]`。打破所有的顶部边框，使透明的 Header 直接融入工作区，提升开阔感。
  - **超凡材质：** 所有卡片引入极柔和宽阔的 `rounded-[20px]`/`rounded-2xl`，配以独家调优的弥散呼吸阴影 `shadow-[0_8px_30px_rgb(0,0,0,0.04)]`。
  - **深色科幻侧边栏：** 侧边栏更换为特调暗夜蓝 `bg-[#0B1120]`，菜单激活项不再是死板的方块，而是胶囊状 `rounded-xl bg-indigo-500/10`。
  - **精妙绝伦的数据排版：** 引入极端的高对比度文字层级。大标题与大数字强制使用 `text-slate-800 font-extrabold tracking-tight`，标签使用 `text-[11px] font-bold uppercase tracking-wider`。列表项取消实线，使用带 Hover 背景差的极简排版并配合带圆角的精美小 Icon 图标框。按钮注入了厚重且发光的 `shadow-[0_4px_14px...rgba]` 电光紫立体交互体验。全面达成了“下一代 AI B 端协同网络”的顶级视觉体验。
- **UI 收敛与质感升华：Gemini 专业级 B端 AI 控制台定型 (2026-03-19)**：
  - **从“概念稿”回归“生产工具”**：修复了前述强设计风格带来的突兀与空洞感。摒弃夸张的 20px 圆角与巨大的弥散阴影，将系统统一切换为极其克制、专业、高质感的真正 SaaS 黄金标准。
  - **像素级间距与色域框定**：卡片统一使用经典的 `rounded-xl` 配以极干净的 `shadow-sm` 和 `border-slate-200`，彻底去除了花哨的背景悬浮效果；背景回归纯净的 `bg-slate-50` 浅灰，侧边栏稳定在 `bg-slate-900`。
  - **版式与线条的再次驯化**：不再滥用 `font-extrabold` 加粗字和奇怪的特小大写字母标牌。数据展示强制使用标准 `text-[14px]`、`13px` 辅助字，并通过极细的行边框和精心搭配的有背景色的功能 ICON (`bg-indigo-50 text-indigo-600`)，以最低的认知负荷渲染最高级的极客严谨美学。

## 后续规划（建议）
- 接入 `TailwindCSS` 以增强布局与响应式设计。
- 引入持久化或路由，用于历史记录与多页面导航。
- 表格增强：分页、排序、筛选、导出 CSV。
- WebSocket 集成：若需更实时状态更新，可升级轮询为 WebSocket 推送。
