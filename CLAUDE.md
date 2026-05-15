# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概览

SPA/按摩店咨询管理系统的微信小程序。处理咨询记录、预约管理、技师轮牌队列、结算、蓝牙打印和数据分析。

Skyline 渲染引擎 + glass-easel 组件框架。云函数运行在微信云 (wx-server-sdk) 上。

## 构建与检查

```bash
npm run lint              # ESLint 检查 miniprogram/**/*.ts
npm run lint:fix          # 自动修复 lint 问题
npm run format            # Prettier 格式化 .ts/.wxml/.less/.json
npm run format:check      # 仅检查格式
```

无构建步骤 — 微信 IDE 通过编译器插件编译 TypeScript 和 Less（配置在 `project.config.json` 中）。

云函数测试（Jest）：`cd` 到函数目录后运行 `npx jest`。目前仅 `getAvailableTechnicians/` 有测试。

## 架构

```
miniprogram/
  pages/           # 18 个页面（完整列表见 app.json）
  components/      # 可复用 UI 组件（timeline, reservation-modal, selectors）
  services/        # 业务逻辑层
  utils/           # 共享工具（auth, cloud-db, permission, loading-service）
  types/           # 共享类型定义
  config/          # 静态配置（如可打印二维码）
cloudfunctions/    # 14 个 Node.js 云函数
  shared/          # 云函数间共享的 utils.js
typings/           # 全局 .d.ts — 所有领域类型定义在此
```

### 核心页面

- **index** (`pages/index/`) — 主咨询表单。最复杂的页面，包含自己的 `handlers/`、`services/` 和 `utils/` 子目录。支持单人模式和多人模式。
- **cashier** (`pages/cashier/`) — 每日预约/排班视图，包含时间线组件、支付结算、微信推送通知。
- **history** (`pages/history/`) — 历史咨询记录，支持作废/编辑/删除和工资汇总。
- **analytics** (`pages/analytics/`) — 图表与统计（通过 `utils/wx-charts.js` 使用 wx-charts）。
- **staff**, **store-config**, **customers**, **membership-cards**, **data-management**, **lottery**, **screensaver**, **calculator**, **store-expense** — 辅助页面。

### 核心服务 (`services/`)

- **printer-service.ts** — BLE 打印机发现、连接，通过 GBK 编码以 20 字节分块打印
- **reservation.service.ts** — 预约增删改查、技师可用性检查、按性别自动分配、企业微信推送消息
- **print-content-builder.ts** — 构建包含客户历史的咨询小票打印内容
- **customer.service.ts** — 按姓名/电话匹配客户

### 核心工具 (`utils/`)

- **cloud-db.ts** — `wx.cloud.database()` 之上的数据库抽象层。提供增删改查、分页和事务支持的咨询保存。导出 `Collections` 常量，包含所有集合名称。
- **auth.ts** — `AuthManager` 单例，通过云函数处理静默登录、token 存储和用户会话管理。
- **permission.ts** — 基于角色的访问控制。5 个角色（管理员/收银员/技师/查看者/品牌），具有页面级和按钮级权限。
- **loading-service.ts** — 基于锁的异步操作包装器，使用命名锁键防止重复提交。
- **constants.ts** — 按摩力度、性别、优惠券平台、班次类型/时间、加班计算。
- **util.ts** — 日期/时间辅助函数（包含 `parseProjectDuration`，从类似"项目名90min"的项目名称中提取分钟数）。
- **validators.ts** — 咨询信息表单验证（单人和多人模式）。
- **wechat-work.ts** — 格式化企业微信 `@mention` 标签用于推送通知。

### 类型系统 (`typings/index.d.ts`)

所有领域类型均为全局定义（无需导入）：`ConsultationInfo`、`ConsultationRecord`、`ReservationRecord`、`StaffInfo`、`ScheduleRecord`、`CustomerRecord`、`MembershipCard`、`CustomerMembership`、`Project`、`Room`、`EssentialOil`、`RotationQueue`、`StaffAvailability`、`UserRecord`、`UserPermissions`、`StaffTimeline`、`TimelineBlock`、`SettlementInfo`、`PaymentItem`、`LotteryPrize`、`StoreExpense` 等。

泛型辅助类型：`Add<T>` = `Omit<T, '_id' | 'createdAt' | 'updatedAt'>`，`Update<T>` = `Add<T>`。

### 云函数

| 函数 | 用途 |
|---|---|
| `login` | 使用 wx.login code 静默登录，token 生成，员工绑定 |
| `getAll` | 从集合中获取所有记录（cloud-db.ts 使用） |
| `saveConsultationTransaction` | 事务性咨询插入，含重复检测 |
| `getAvailableTechnicians` | 复杂可用性检查（预约 + 咨询），预约重排 |
| `manageRotation` | 轮牌队列增删改查、服务客户、位置调整 |
| `sendWechatMessage` | 企业微信 webhook 消息推送 |
| `getReportStatistics` | 工资/佣金报表 |
| `getAnalytics` | 数据分析聚合 |
| `getHistoryData` | 历史数据查询 |
| `getCustomerHistory` | 客户消费历史 |
| `matchCustomer` | 按姓名/电话查找客户 |
| `backup` / `restore` | 数据库备份/恢复 |

### 核心业务概念

- **咨询单** — 客户接受服务。包含项目、技师、房间、开始/结束时间、结算信息以及可选的加班/加钟/刮痧。
- **预约** — 提前预订。支持指定技师（点钟）和按性别要求两种模式。记录以 `groupKey` 分组，用于多技师预约。
- **轮牌** — 每日技师排队。延续前一天的收工顺序。点钟不改变排队位置；普通轮排服务后将技师移至队尾。完整算法见 `docs/轮排和排钟规则.md`。
- **结算** — 支持多种支付方式组合（美团、大众点评、抖音、微信、支付宝、现金、高德、免费、会员卡）。

### 蓝牙打印流程

1. `printerService.ensureConnected()` — 扫描名为 "Printer" / "打印机" 的 BLE 设备
2. 通过 `PrintContentBuilder` 构建内容（咨询详情 + 客户历史）
3. 通过 `gbk.js` 将内容从 UTF-8 编码为 GBK
4. 通过 `wx.writeBLECharacteristicValue()` 以 20 字节分块发送
5. 多页打印，页间延迟 500ms

### 权限模型

定义在 `utils/permission.ts` 中。每个角色具有页面访问和按钮操作的完整布尔值矩阵。页面加载时通过 `requirePagePermission()` 检查，按钮通过 `hasButtonPermission()` 检查。

### 小程序 NPM

需要原生小程序支持的依赖通过微信 IDE 的"构建 npm"功能构建 — 输出到 `miniprogram/miniprogram_npm/`。仅 `gbk.js` 是运行时依赖。
