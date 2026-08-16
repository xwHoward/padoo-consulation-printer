# ConsultationPrinter - 浏览器插件 AI Agent 上下文
# 最后更新: 2026-06-12

## === 项目概要 ===
- **名称**: Consultation Printer (浏览器插件)
- **路径**: `browser-extension/`
- **核心目标**: 在网页右侧注入侧边栏，包含元素抓取 + mini 收银台功能
- **首要目标平台**: Linux Firefox (其他平台兼容 Chrome/Edge)

## === 技术选型 (已确定) ===
| 项目         | 选型                   | 原因                                      |
|-------------|------------------------|-------------------------------------------|
| 框架         | Vue 3                  | 用户偏好                                   |
| 构建         | Vite 4                 | 当前环境 Node 16，Vite 5 需 Node 18+       |
| 样式         | Less + Scoped          | 遵循 workspace 规则，嵌套语法减少样式污染     |
| Manifest    | V2                     | Firefox 完全兼容                            |
| 侧边栏实现    | DOM 注入                | 注入到宿主页面，全浏览器兼容                  |
| 后端 SDK     | @cloudbase/js-sdk      | 腾讯云 CloudBase Web SDK，替代 wx.cloud     |
| 元素抓取方式  | 侧栏按钮 + CSS选择器     | 用户偏好                                   |

## === 架构 ===
```
public/
  content-loader.js       → [DEV] HMR content script，从 Vite dev server 加载

manifest.json             → PROD 清单 (content.js + assets/content.css)
manifest.dev.json         → DEV 清单 (content-loader.js)

scripts/
  dev-setup.js            → DEV 模式初始化
  copy-files.js           → PROD 构建后复制 manifest/icons/background 到 dist

src/
  content.js              → 入口: mount Vue App → SidePanel
  background.js           → install 监听
  sidebar/
    main.js               → Vue 挂载（dev/extension 双模式）
    App.vue               → 根组件
    services/
      cloudbase.js        → CloudBase SDK 初始化 + callFunction/collection
    composables/
      useDataLoader.js    → 数据加载（房间/员工/轮牌/快速预约）
      useReservation.js   → 预约逻辑（表单/可用性/保存/取消）
      useCustomerMatch.js → 顾客匹配
      useEnvironment.js   → CloudBase 环境配置注入
    components/
      SidePanel.vue           → 侧边栏容器 (折叠/拖拽/「抓取」「收银」Tab)
      CashierPage.vue         → 收银台主页面 (排钟+预约+房间+推送)
      ElementGrabber.vue      → CSS 选择器抓取元素
      Modal.vue               → 通用弹窗
      DatePicker.vue          → 日期选择（前后翻页+今天）
      GenderSelector.vue      → 性别选择
      ProjectSelector.vue     → 项目多选
      TechnicianSelector.vue  → 技师选择（支持点钟标记）
      Timeline.vue            → 排钟轮牌列表
      RoomGrid.vue            → 房间占用状态
      ReservationModal.vue    → 预约表单弹窗（含顾客匹配）
      ExtraTimeModal.vue      → 加钟弹窗
      ArrivalConfirmModal.vue → 到店确认弹窗

dist/ → 加载到浏览器的最终产物
```

## === HMR 热更新 ===
```bash
npm run dev:extension  # 可手动执行（沙箱限制）
npm run dev            # vite dev server
```
原理: content-loader.js → 注入 @vite/client + src/sidebar/main.js → HMR

## === CloudBase 配置 ===
- SDK: `@cloudbase/js-sdk` (已安装)
- 环境 ID: 默认 `your-env-id`，替换方式：
  1. 在宿主页面设置 `window.__CLOUDBASE_ENV_ID__`
  2. 或在 `services/cloudbase.js` 中修改 `defaultConfig.env`
- 数据库集合: consultation, reservations, customers, projects, staffs, rooms, rotation
- 云函数: getAvailableTechnicians, saveReservation, cancelReservation

## === 当前状态 ===
### 已完成
- [x] 项目初始化 + HMR + CORS 修复
- [x] ElementGrabber: CSS 选择器抓取
- [x] CashierPage: 排钟/快速预约/房间/推送（除结算外全部功能）
- [x] Vue 组件库: Modal/DatePicker/GenderSelector/ProjectSelector/TechnicianSelector
- [x] Composables: useDataLoader/useReservation/useCustomerMatch
- [x] CloudBase SDK 集成
- [x] 双 Tab 切换：「抓取」「收银」
- [x] 构建验证通过

### 待办
- [ ] 配置实际的 CloudBase 环境 ID (services/cloudbase.js)
- [ ] 完善 ReservationModal 中 emit 事件的双向绑定
- [ ] 加钟/到店通知的完整业务逻辑
- [ ] 替换占位图标

## === 已修复的问题 ===
1. 侧边栏不可见 → manifest.json 缺少 CSS 注入
2. CORS 阻止 → vite.config.js 添加 Access-Control-Allow-Origin: *
3. 开发效率低 → HMR 热更新机制

## === 注意事项 ===
- content.js 已 792KB (含 CloudBase SDK)，首次加载可能较慢
- 修改 `services/cloudbase.js` 中的 `defaultConfig.env` 配置你的 CloudBase 环境
- 当前超长分块 >500KB 是 CloudBase SDK 自身体积，非业务代码问题

## === 对话历史摘要 ===
1. 创建跨浏览器插件 (Vue3+Vite, Manifest V2, DOM注入侧边栏)
2. 实现侧边栏 + 元素抓取 → 修复CSS/CORS → HMR热更新
3. 创建 AI_CONTEXT.md
4. 移植 cashier 页面到插件：
   - 除结算外全部功能（排钟/预约/房间/推送/加钟/到店）
   - 重新实现 11 个 Vue 组件 + 5 个 composables
   - 集成 @cloudbase/js-sdk 替代 wx.cloud
