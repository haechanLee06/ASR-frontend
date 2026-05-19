# ASR-Frontend 前端架构说明文档


## 1. 技术栈选型

- **核心框架**: Vue 3 (Composition API `<script setup>` 语法) + Vite构建
- **UI 框架**: Element Plus (提供基础的组件如按钮、表格、弹窗等)
- **样式方案**: Tailwind CSS (利用 Utility-First 快速编写样式)
- **状态管理**: Pinia
- **前端路由**: Vue Router
- **数据交互**: Axios (已在 `src/api` 中封装拦截器)
- **业务可视化**: Wavesurfer.js (音频波形图渲染)、ECharts & ECharts WordCloud (大模型分析词云及图表)

## 2. 核心架构与工程目录

项目的代码核心集中在 `src` 目录下，遵循典型的单页面应用（SPA）架构：

```text
src/
├── api/          # 接口请求层：包含 axios 实例配置及按业务划分的 API 方法
├── assets/       # 静态资源：存放图片、全局共享的 CSS/SCSS 变量等
├── components/   # 核心组件库：提取的业务组件（波形组件、状态栏等）
├── router/       # 路由控制：定义页面映射规则、路由守卫（登录鉴权拦截）
├── stores/       # 状态管理：基于 Pinia，存储用户 Token、全局配置等
├── styles/       # 全局样式：Tailwind 指令及针对 Element Plus 的样式覆盖
├── views/        # 页面级视图层：核心业务页面
├── App.vue       # 根组件：承载路由出口 `<router-view>`
└── main.js       # 入口文件：注册 Vue 实例、路由、Pinia 及各类插件
```

## 3. 页面视图层 (views) 解析

所有的主要交互页面均放置在 `src/views/` 目录下：

- **`Login.vue`**：用户登录/注册页，完成身份认证后获取 Token 并存入 Pinia/LocalStorage。
- **`Layout.vue`**：系统的基础骨架（后台管理系统经典布局），包含左侧边栏（导航）和顶部 Header，子页面通过其内部的 `<router-view>` 动态加载。
- **`Dashboard.vue`**：**核心工作台**。负责语音文件的上传、实时麦克风录音的控制、与后端 ASR 服务的交互，并初步展示识别结果。
- **`Voiceprint.vue`**：**声纹识别模块**。用于展示多说话人分离（Speaker Diarization）的结果，匹配不同的声纹角色。
- **`TranscriptCheck.vue`**：**转写校对与大模型交互页**。提供识别文本的精校对功能，并接入了 Qwen 心理/语义分析大模型（LLM），根据文本生成心理评估、情感分析或摘要。
- **`History.vue`**：**历史记录页**。展示用户的历史识别任务列表，支持分页和查询，可点击跳转至详情。
- **`Detail.vue`**：**任务详情页**。查看特定历史任务的详细音频、波形图、识别文本以及大模型分析的深度结果（包含 ECharts 渲染的词云图等）。

## 4. 业务组件 (components) 解析

`src/components/` 包含在多个页面中复用的业务组件，以降低页面代码的耦合度：

- **`WaveformPlayer.vue`**：基于 `wavesurfer.js` 封装的音频波形播放器，支持播放/暂停、进度拖拽、波形渲染，主要被 `Dashboard` 和 `Detail` 页面引用。
- **`DashboardStatusBar.vue`**：工作台顶部的状态指示栏，用于向用户反馈当前系统的连接状态、模型加载情况及录音状态。

## 5. 核心数据流向

1. **接口请求拦截**：在 `api` 目录下的 axios 实例中，所有的请求都会在 Header 中自动注入 Pinia 里存储的 Token，并在响应拦截器中统一处理 `401` 过期、网络错误等异常，直接弹出 Element Plus 的 Message 提示。
2. **鉴权路由拦截**：`router/index.js` 中配置了全局前置守卫（`router.beforeEach`），当用户尝试访问 `Layout` 及其子路由时，会校验是否存在 Token，若无则强制重定向至 `/login`。
3. **音频数据处理**：前端录音获取的 Blob 数据，或用户上传的音频文件，会通过 `FormData` 组装，经由 axios 提交给后端的 ASR 接口。返回的文本结构再交由组件状态（Ref/Reactive）进行视图更新，或进一步传递给 LLM 接口进行深度分析。
