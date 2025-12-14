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
    components/            ← 业务组件（模板示例保留）
    assets/                ← 静态资源
    main.js                ← 应用入口，注册 Element Plus
    router/                ← 路由配置与守卫（/login、/dashboard、/history、/detail/:id）
    stores/                ← Pinia 状态（用户认证 token/username）
    views/
      Login.vue            ← 登录/注册页
      Layout.vue           ← 后台框架（侧边栏+顶部）
      Dashboard.vue        ← 上传页（成功后跳转详情）
      History.vue          ← 历史记录列表
      Detail.vue           ← 详情页（微信风格聊天 + 固定播放器）
  vite.config.js           ← Vite 配置与 @ 别名
  docs/development.md      ← 开发文档（本文件）
```

## 架构设计
- UI 层：基于 Element Plus 布局（`el-container`、`el-header`、`el-main`），`el-upload` 拖拽上传，`el-table` 列表展示，`<audio>` 分段播放。
- API 层：`src/api` 统一封装请求；`request.js` 管理实例与拦截，`audio.js` 提供上传接口。
- 状态管理：引入 `Pinia`（`src/stores`），集中维护用户认证信息（`token`、`username`），提供 `login`/`logout` 行为。
- 路由系统：引入 `vue-router`（`src/router`），配置登录与后台主框架，路由守卫基于 Token 实现未登录重定向。

## 前后端交互约定
- 基地址：`http://localhost:5000`
- 上传接口：`POST /upload`
  - Header：`Content-Type: multipart/form-data`
  - Body：`file`
  - 响应：`{ code: 200, data: { record_id: string } }`
- 查询详情：`GET /record/:id`
  - 响应：`{ code: 200, data: { segments: Segment[] } }`
- 历史列表：`GET /history`
- 认证：`POST /auth/login`、`POST /auth/register`
  - 登录响应：`{ code: 200, data: { access_token: string } }`

## 请求工具说明
- 文件：`src/api/request.js`
- 行为：创建 Axios 实例（`baseURL`=`http://localhost:5000`），在响应拦截器中：
  - 当 `res.data.code !== 200`：通过 Element Plus `ElMessage.error` 提示错误，并 `Promise.reject`。
  - 网络或服务端错误：统一提示并抛出异常。
- 返回：成功时返回 `response.data`，便于直接取用 `data.segments`。
- 鉴权：请求拦截自动注入 `Authorization: Bearer <token>`；收到 `401` 时登出并跳转 `/login`。

## 页面功能与实现
- Login：登录/注册切换；成功后保存 Token 到 Pinia 与 localStorage。
- Layout：侧边导航（工作台/历史），顶部显示用户名与退出。
- Dashboard：仅负责上传；成功后读取 `record_id` 并跳转 `/detail/:id`。
- Detail：
  - 左侧微信风格聊天窗口：`spk0` 左对白气泡白/灰，`spk1` 右侧绿色气泡；选中高亮。
  - 右侧固定音频面板（Sticky）：显示当前文本，大字号，自动播放当前段音频。
  - 音频地址拼接：`http://localhost:5000/` + `path.replace(/^\//, '')`。
- History：列表展示上传时间、文件名、时长、状态；点击“查看”跳转详情页。

## 开发与启动
- 安装依赖：`npm install`
- 启动开发：`npm run dev` → 访问 `http://localhost:5173/`
- 构建生产：`npm run build`
- 预览生产：`npm run preview`

## 提交与推送
- 常规流程：
  - `git add .`
  - `git commit -m "feat: 描述本次改动"`
  - `git push`
- 分支策略（建议）：
  - 主分支：`main`
  - 功能分支：`feature/*`
  - 修复分支：`fix/*`

## 代码约定
- 使用 Composition API 与 `<script setup>`。
- 统一通过 `@` 别名导入 `src` 下模块（`vite.config.js` 已配置）。
- 错误使用 `ElMessage` 统一提示；避免在控制台打印敏感信息。

## 变更记录
- 初始化：Vite + Vue 3 项目，集成 Element Plus 与 Axios。
- 新增：`@` 别名配置于 `vite.config.js`。
- 新增：请求工具 `src/api/request.js` 与上传接口封装 `src/api/audio.js`。
- 重写：`src/App.vue` → 作为路由根容器（`<router-view />`）。
- 新增：本开发文档，并完善架构与交互说明。
- 接口联调：上传接口统一指向 `/upload`；优化音频 URL 拼接防止双斜杠；确认表格字段与后端 JSON（`text`, `spk`, `start`, `end`）完全对应。
- 架构升级：
  - 安装并集成 `vue-router` 与 `pinia`；
  - 新建 `src/router/index.js`，配置 `/login`、`/dashboard`、`/history`，以及父路由 `Layout.vue`；
  - 新建 `src/stores/index.js` 与 `src/stores/user.js`，集中管理用户状态与认证；
  - 升级 `src/api/request.js`，在请求拦截中自动注入 `Authorization: Bearer <token>`，在响应拦截中处理 `401` 并登出跳转；
  - 页面拆分：`Login.vue`（登录/注册）、`Layout.vue`（框架与导航）、`Dashboard.vue`（上传识别）、`History.vue`（历史列表）。
 - 用户流程重构：
   - Dashboard 仅上传并在成功后跳转至 `/detail/:id`；
   - 新增 `Detail.vue` 展示微信风格聊天详情，右侧固定音频面板；
   - History 列表加入“查看”跳转详情；
   - 修正登录 Token 解析为 `res.data.access_token` 优先，优化错误提示。

## 后续规划（建议）
- 接入 `TailwindCSS` 以增强布局与响应式设计。
- 引入持久化或路由，用于历史记录与多页面导航。
- 表格增强：分页、排序、筛选、导出 CSV。
- 更丰富的错误处理：针对后端返回不同错误码的细粒度提示。
