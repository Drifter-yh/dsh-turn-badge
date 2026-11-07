# dsh-turn-badge

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/Drifter-yh/dsh-turn-badge/actions/workflows/ci.yml/badge.svg)](https://github.com/Drifter-yh/dsh-turn-badge/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-turn-badge)](https://www.npmjs.com/package/dsh-turn-badge)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：像 Codex 一样，
**一轮对话跑完后在系统层面提醒你** —— 系统通知、应用图标角标、标题红点，回到窗口自动清空。

> 社区插件，与 DeepSeek 官方无关，也不由官方维护。

## 解决什么问题

Harness 经常跑长任务。你切到别的窗口以后，任务完成只是侧边栏里一个你可能根本没看的小点；
操作系统层面什么都没发生：没有通知、任务栏 / Dock 没有红点，只能靠自己想起来回去看。

## 做了什么

会话从「运行中」变成「空闲」时：

- **系统通知**：标题 + 会话名，例如「任务完成 —— 写周报」；点一下聚焦窗口，并在可用时打开该会话。
- **应用图标角标**：通过 Badging API（`setAppBadge`）显示未读会话数；支持的浏览器还会调用
  `setClientBadge` 给页签加角标。
- **标题红点**：窗口 / 页签标题前加 `● `，任何载体都有兜底。
- **聚焦即清空**：回到窗口时清掉角标、标题红点和通知。

正在看的那个会话完成时不打扰；默认跳过子代理；按会话数而不是轮次数统计。

## 安装

包已经发布到 npm（`dsh-turn-badge@0.1.0`），也可以直接从 GitHub 安装。

```bash
# 从 npm 安装
dsh plugin --profile <你的 profile> add dsh-turn-badge

# 从 GitHub 安装（同一份代码）
dsh plugin --profile <你的 profile> add github:Drifter-yh/dsh-turn-badge
```

部分版本也可以在 **Settings → Plugins** 里安装。

如果手里是源码目录，自带的便携安装器会把它装进当前 profile：

```bash
node install.mjs          # 写入 <profile>/plugins/dsh-turn-badge，并登记 file: 依赖
node uninstall.mjs        # 卸载
```

装完**重启一次 Harness**（宿主只在启动时读取 profile）。

第一次点击或按键时会请求通知权限；macOS 还要在「系统设置 → 通知 → DeepSeek Harness」里允许。

## 设置

设置放在 `localStorage`，在开发者工具控制台改完刷新页面：

```js
localStorage.setItem('dsh-turn-badge.settings', JSON.stringify({
  enabled: true,                       // 总开关
  toast: true,                         // 系统通知
  badge: true,                         // 应用图标 / 页签角标
  titleDot: true,                      // 标题红点兜底
  notifyWhenFocusedOtherSession: true, // 窗口在前台、但看的是别的会话时也提醒
  skipSubagents: true                  // 忽略子代理
}))
```

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关，`false` 时整个插件不生效。 |
| `toast` | `true` | 系统通知。 |
| `badge` | `true` | Badging API（应用图标与页签）。 |
| `titleDot` | `true` | `● ` 标题标记。 |
| `notifyWhenFocusedOtherSession` | `true` | 应用在前台但开着别的会话时也提醒。 |
| `skipSubagents` | `true` | 子代理会话不提醒。 |

恢复默认：`localStorage.removeItem('dsh-turn-badge.settings')`。

控制台调试：

```js
__dshTurnBadge.preview()  // 立刻来一条示例通知 + 角标
__dshTurnBadge.clear()    // 清空角标、标题红点和通知
```

## 工作原理

```text
DSH 客户端（浏览器）                        操作系统
┌──────────────────────────────┐
│ uiSession.sessionStatus       │  运行中 → 空闲
│   → 运行状态 / 主视图判断      │ ───────────────▶  Notification
│   → 未读会话集合               │ ───────────────▶  Badging API
│   → document.title            │ ───────────────▶  "● " 标题红点
└──────────────────────────────┘
```

- 客户端半侧订阅 `ctx.uiSession.sessionStatus`，也就是 Harness 客户端本来就维护的每会话
  `{ running, pendingInteraction, completionUnread }` 快照；加载时记一份基线，之后只在真正的
  **运行中 → 空闲** 转换时动作。
- 会话标题来自客户端会话列表；不读取对话正文。
- 宿主半侧是空的，只负责让这个包成为激活的 Loader 条目，`dsh-client-modules` 才会发布客户端 bundle。
- 没有 HTTP 端点、没有模型调用、没有任何网络请求。

## 平台支持

全部是浏览器标准 API，没有 Windows / macOS 专属代码：

| 能力 | Windows | macOS |
| --- | --- | --- |
| 系统通知 | 通知中心 | 通知中心 |
| 应用图标角标 | Badging API（已安装 PWA / 支持的 Chromium 载体） | Badging API（支持的 Chromium / Safari 载体） |
| 页签角标 | Chromium `setClientBadge` | Chromium `setClientBadge` |
| 标题红点 | 所有载体 | 所有载体 |

**一个诚实的限制**：DSH 桌面版任务栏 / Dock 上的红点，取决于 Electron 对 Badging API 的支持；
页面里的插件没法直接调 Electron 主进程。不支持角标时，系统通知和标题红点照常工作。装成 PWA 的
浏览器里，红点效果最完整。

## 隐私

- 没有遥测、统计或远程请求。
- 只读会话状态和会话**标题**，不读消息正文、工具输出或文件。
- 唯一写入的是 `localStorage` 里的设置。
- 通知内容由操作系统在本地渲染。

完整威胁模型见 [SECURITY.md](SECURITY.md)。

## 兼容性

- Harness `>=0.2.2-rc.1 <0.2.3-0`；已在 `0.2.2-rc.1` 的 desktop profile 上验证。
- 支持 `web` 与 `desktop` 两种 profile。
- 依赖标准 Web 客户端里的 `uiSession`、`sessions` 服务。

## 限制

- **角标取决于载体**，见上面的平台表。
- **页面必须还活着**：桌面版收进托盘仍会提醒；被系统冻结的浏览器标签页可能延迟。
- **失败和成功长得一样**：任何「运行中 → 空闲」都按完成处理。
- **默认跳过子代理**；要提醒它们就设 `skipSubagents: false`。
- **标题红点会被重新补上**：外壳改写 `document.title` 时，观察器下一帧再补，切页时可能闪一下。

## 排错

| 现象 | 检查 |
| --- | --- |
| 没有系统通知 | 允许应用通知；关闭勿扰模式；试 `__dshTurnBadge.preview()` |
| 没有红点 | 载体没实现 Badging API；用已安装的 PWA，或依赖标题红点 |
| 完全没反应 | 重启 Harness（宿主只在启动时读 profile）；看控制台有没有 `[dsh-turn-badge]` |
| 提醒了两次 | 是两个会话先后完成；角标按会话计数，不按轮次 |
| 标题红点消失 | 别的插件覆写了标题；观察器会在下次变化时补回 |

## 开发

```bash
npm test          # 7 个无浏览器测试，跑在 Node vm 沙箱里
npm run check     # 两半的语法检查
npm run pack:check
```

客户端 bundle 是手写 JavaScript，通过 `window.__ModuleLoader__.load` 注册，没有构建步骤。
打 tag 后 CI 会创建 GitHub Release（`.github/workflows/release.yml`）；只有仓库配置了
`NPM_TOKEN` secret 才会同时发布到 npm，所以没有 token 时 tag 仍能正常出 Release。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
