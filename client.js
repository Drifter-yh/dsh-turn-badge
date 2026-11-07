/**
 * dsh-turn-badge — client half.
 *
 * 目标：像 Codex 一样，在一轮对话跑完后给出「系统级」提醒。
 *
 * 做法全部基于浏览器标准 API，因此 Windows / macOS、DSH Desktop / 浏览器
 * Web GUI 都能用：
 *   1. 会话从 running → idle 时，发一条系统通知（Electron / Chrome / Edge /
 *      Safari 都走各自的系统通知中心）；
 *   2. 用 Badging API（`navigator.setAppBadge`）给应用图标挂未读数。支持的
 *      载体是「已安装的 PWA / 部分浏览器」；不支持时静默跳过；
 *   3. 页签/窗口标题前加一个 `● ` 作为兜底红点；
 *   4. 窗口重新获得焦点时自动清空。
 *
 * 完成状态直接读 `uiSession.sessionStatus`：它是 DSH 客户端本来就维护的
 * 每会话 `{ running, pendingInteraction, completionUnread }` 快照，比轮询
 * 历史或猜 DOM 稳得多。
 *
 * 设置（localStorage，改完刷新页面生效）：
 *   dsh-turn-badge.settings = {
 *     "enabled": true,                        // 总开关
 *     "toast": true,                          // 系统通知
 *     "badge": true,                          // 应用图标角标（Badging API）
 *     "titleDot": true,                       // 标题红点兜底
 *     "notifyWhenFocusedOtherSession": true,  // 窗口在前台、但你看着别的会话时也提醒
 *     "skipSubagents": true                   // 子代理完成不提醒
 *   }
 *
 * 调试：控制台执行 `__dshTurnBadge.preview()` 可立刻看一条示例通知，
 * `__dshTurnBadge.clear()` 清空提醒。
 */
window.__ModuleLoader__.load({
  id: 'dsh-turn-badge',

  factory() {
    'use strict'

    const SETTINGS_KEY = 'dsh-turn-badge.settings'
    const TITLE_MARK = '● '
    const TOAST_TAG_PREFIX = 'dsh-turn-'

    const DEFAULT_SETTINGS = Object.freeze({
      enabled: true,
      toast: true,
      badge: true,
      titleDot: true,
      notifyWhenFocusedOtherSession: true,
      skipSubagents: true,
    })

    const COPY = (() => {
      const lang = (() => {
        try { return String(window.navigator.language || '') } catch { return '' }
      })().toLowerCase()
      if (lang.startsWith('zh')) {
        return {
          doneTitle: '任务完成',
          doneBody: (title) => `「${title}」已完成，点按查看`,
          doneBodyFallback: '当前会话已回复完成，点按回到应用查看',
          unsupported: '系统通知不可用，已退回标题红点。',
        }
      }
      return {
        doneTitle: 'Task finished',
        doneBody: (title) => `“${title}” finished — click to view`,
        doneBodyFallback: 'The current task finished — click to return to the app',
        unsupported: 'System notifications are unavailable; using the title dot instead.',
      }
    })()

    function readSettings() {
      const settings = { ...DEFAULT_SETTINGS }
      try {
        const raw = window.localStorage && window.localStorage.getItem(SETTINGS_KEY)
        if (!raw) return settings
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return settings
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (typeof parsed[key] === typeof DEFAULT_SETTINGS[key]) settings[key] = parsed[key]
        }
      } catch {
        // 存储损坏 / 隐私模式：用默认值，不阻塞插件。
      }
      return settings
    }

    function notificationPermission() {
      try {
        if (typeof window.Notification !== 'function') return 'denied'
        return window.Notification.permission
      } catch {
        return 'denied'
      }
    }

    /**
     * 申请通知权限需要一个用户手势；挂在第一次 pointerdown / keydown 上。
     * 已经是 granted / denied 时不做任何事。
     */
    function requestPermissionOnFirstGesture() {
      if (notificationPermission() !== 'default') return
      const ask = () => {
        cleanup()
        try {
          const pending = window.Notification.requestPermission()
          if (pending && typeof pending.catch === 'function') pending.catch(() => {})
        } catch {
          // 老浏览器同步回调式 API 或直接拒绝，忽略即可。
        }
      }
      const cleanup = () => {
        try { window.removeEventListener('pointerdown', ask, true) } catch {}
        try { window.removeEventListener('keydown', ask, true) } catch {}
      }
      try {
        window.addEventListener('pointerdown', ask, true)
        window.addEventListener('keydown', ask, true)
      } catch {}
    }

    function readListSnapshot(sessions) {
      try {
        const snapshot = sessions.list.getSnapshot()
        return snapshot && typeof snapshot === 'object' ? snapshot : {}
      } catch {
        return {}
      }
    }

    function rowOf(sessions, sessionId) {
      const byId = readListSnapshot(sessions).byId
      return byId && typeof byId === 'object' ? byId[sessionId] : undefined
    }

    function sessionTitle(sessions, sessionId) {
      const title = rowOf(sessions, sessionId)?.title
      return typeof title === 'string' && title.trim() !== '' ? title.trim() : ''
    }

    /** 当前主视图正在看的会话（多个时取第一个）。 */
    function mainSessionId(sessions) {
      const byId = readListSnapshot(sessions).byId
      if (!byId || typeof byId !== 'object') return undefined
      for (const id of Object.keys(byId)) {
        const retained = byId[id]?.retainedBy
        if (!retained || typeof retained !== 'object') continue
        const mainView = retained.mainView
        if (typeof mainView === 'number' ? mainView > 0 : mainView === true) return id
      }
      return undefined
    }

    function isSubagentRow(row) {
      if (!row || typeof row !== 'object') return false
      return row.origin === 'subagent' || row.parentSessionId !== undefined
    }

    function apply(ctx) {
      const settings = readSettings()
      if (!settings.enabled) return
      if (typeof window === 'undefined' || typeof document === 'undefined') return

      const uiSession = ctx.uiSession
      const sessions = ctx.sessions
      if (!uiSession || !sessions) return

      const unread = new Set()
      const toasts = new Set()
      let previousRunning = new Map()
      let titleObserver
      let paintingTitle = false
      let disposed = false

      /* ---------------- 通知 ---------------- */

      function showToast(sessionId, title) {
        if (!settings.toast) return
        if (notificationPermission() !== 'granted') return
        const body = title === '' ? COPY.doneBodyFallback : COPY.doneBody(title)
        let toast
        try {
          toast = new window.Notification(COPY.doneTitle, {
            body,
            tag: `${TOAST_TAG_PREFIX}${sessionId}`,
            renotify: true,
            silent: false,
          })
        } catch {
          return
        }
        toasts.add(toast)
        const forget = () => { toasts.delete(toast) }
        toast.onclose = forget
        toast.onerror = forget
        toast.onclick = () => {
          try { window.focus() } catch {}
          openSession(sessionId)
          unread.delete(sessionId)
          forget()
          try { toast.close() } catch {}
          syncBadge()
          paintTitle()
        }
      }

      function openSession(sessionId) {
        try {
          const workspace = ctx.get('uiWorkspace')
          if (workspace && typeof workspace.openSession === 'function') {
            workspace.openSession(sessionId)
            return
          }
        } catch {
          // 没有 workspace 服务就只聚焦窗口。
        }
      }

      function closeToasts() {
        for (const toast of toasts) {
          try { toast.close() } catch {}
        }
        toasts.clear()
      }

      /* ---------------- 应用图标角标 / 标题红点 ---------------- */

      function callBadge(nav, method, value) {
        if (!nav || typeof nav[method] !== 'function') return
        try {
          const pending = value === undefined ? nav[method]() : nav[method](value)
          if (pending && typeof pending.catch === 'function') pending.catch(() => {})
        } catch {
          // 单个载体不支持就跳过，其他角标/通知继续。
        }
      }

      function syncBadge() {
        if (!settings.badge) return
        const nav = window.navigator
        const count = Math.min(unread.size, 99)
        if (count > 0) {
          // setAppBadge：应用图标（已安装 PWA / Dock / 任务栏）
          callBadge(nav, 'setAppBadge', count)
          // setClientBadge：浏览器页签角标（Chrome 117+）
          callBadge(nav, 'setClientBadge', count)
        } else {
          callBadge(nav, 'clearAppBadge')
          callBadge(nav, 'clearClientBadge')
          // 有 setAppBadge 但没有 clearAppBadge 的载体：用 0 兜底。
          if (typeof nav?.setAppBadge === 'function' && typeof nav?.clearAppBadge !== 'function') {
            callBadge(nav, 'setAppBadge', 0)
          }
          if (typeof nav?.setClientBadge === 'function' && typeof nav?.clearClientBadge !== 'function') {
            callBadge(nav, 'setClientBadge', 0)
          }
        }
      }

      function paintTitle() {
        if (!settings.titleDot || typeof document.title !== 'string') return
        const current = document.title
        const base = current.startsWith(TITLE_MARK) ? current.slice(TITLE_MARK.length) : current
        const next = unread.size > 0 ? `${TITLE_MARK}${base}` : base
        if (next === current) return
        paintingTitle = true
        try {
          document.title = next
        } finally {
          paintingTitle = false
        }
      }

      function installTitleObserver() {
        if (!settings.titleDot || typeof MutationObserver !== 'function') return
        try {
          titleObserver = new MutationObserver(() => {
            if (!paintingTitle) paintTitle()
          })
          titleObserver.observe(document.head, { subtree: true, childList: true, characterData: true })
        } catch {
          titleObserver = undefined
        }
      }

      /* ---------------- 完成检测 ---------------- */

      function markReadAll() {
        if (unread.size === 0) return
        unread.clear()
        closeToasts()
        syncBadge()
        paintTitle()
      }

      function onWindowFocus() {
        markReadAll()
      }

      function completed(sessionId) {
        if (disposed) return
        const row = rowOf(sessions, sessionId)
        if (!row) return
        if (settings.skipSubagents && isSubagentRow(row)) return

        const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
        if (focused) {
          const mainId = mainSessionId(sessions)
          if (mainId === sessionId) return
          if (!settings.notifyWhenFocusedOtherSession) return
        }

        unread.add(sessionId)
        syncBadge()
        paintTitle()
        showToast(sessionId, sessionTitle(sessions, sessionId))
      }

      function onStatusChanged() {
        let snapshot
        try { snapshot = uiSession.sessionStatus.getSnapshot() } catch { return }
        if (!snapshot || typeof snapshot.forEach !== 'function') return

        const nextRunning = new Map()
        snapshot.forEach((status, sessionId) => {
          const running = status && status.running === true
          nextRunning.set(sessionId, running)
          const previous = previousRunning.get(sessionId)
          if (previous === true && running === false) completed(sessionId)
        })
        previousRunning = nextRunning
      }

      function seedBaseline() {
        try {
          const snapshot = uiSession.sessionStatus.getSnapshot()
          if (!snapshot || typeof snapshot.forEach !== 'function') return
          snapshot.forEach((status, sessionId) => {
            previousRunning.set(sessionId, status && status.running === true)
          })
        } catch {
          // 初始快照拿不到时从下一个事件开始观察。
        }
      }

      /* ---------------- 生命周期 ---------------- */

      requestPermissionOnFirstGesture()
      seedBaseline()
      installTitleObserver()

      const dispose = () => {
        if (disposed) return
        disposed = true
        try { if (titleObserver) titleObserver.disconnect() } catch {}
        titleObserver = undefined
        closeToasts()
        unread.clear()
        syncBadge()
        try { window.removeEventListener('focus', onWindowFocus) } catch {}
      }

      try {
        ctx.effect(() => {
          let off
          try {
            off = uiSession.sessionStatus.subscribe(onStatusChanged)
          } catch {
            off = undefined
          }
          window.addEventListener('focus', onWindowFocus)
          return () => {
            if (typeof off === 'function') {
              try { off() } catch {}
            }
            dispose()
          }
        }, 'dsh-turn-badge: turn completion watcher')
      } catch (error) {
        dispose()
        try { console.warn('[dsh-turn-badge] 订阅会话状态失败：', error) } catch {}
      }

      // 方便人工验收；不参与正常流程。
      try {
        window.__dshTurnBadge = {
          preview() {
            unread.add('preview')
            syncBadge()
            paintTitle()
            showToast('preview', sessionTitle(sessions, mainSessionId(sessions) || '') || '预览会话')
          },
          clear: markReadAll,
          settings: () => ({ ...settings }),
        }
      } catch {}
    }

    return {
      name: 'dsh-turn-badge',
      inject: ['uiSession', 'sessions'],
      apply,
    }
  },
})
