/**
 * Headless tests for the client bundle.
 *
 * `client.js` is a browser bundle, so the tests run it inside a Node `vm`
 * sandbox with a fake window/document/Notification. The only behavior under
 * test is the plugin's own logic: detect running → idle, then decide whether
 * to notify, badge and mark the title.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const clientSource = readFileSync(join(here, '..', 'client.js'), 'utf8')

/* ----------------------------- fake browser ----------------------------- */

function createEnvironment(settingsRaw = null) {
  const windowListeners = new Map()
  const notifications = []
  const badgeCalls = []

  class FakeNotification {
    static permission = 'granted'
    static requestPermission() { return Promise.resolve('granted') }

    constructor(title, options) {
      this.title = title
      this.options = options || {}
      this.closed = false
      notifications.push(this)
    }

    close() {
      if (this.closed) return
      this.closed = true
      if (typeof this.onclose === 'function') this.onclose()
    }
  }

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  const document = {
    title: 'My Workspace',
    head: {},
    hasFocus: () => false,
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
  }

  const navigator = {
    language: 'en-US',
    setAppBadge(count) { badgeCalls.push(['set', count]); return Promise.resolve() },
    clearAppBadge() { badgeCalls.push(['clear']); return Promise.resolve() },
  }

  const window = {
    document,
    navigator,
    Notification: FakeNotification,
    MutationObserver: FakeMutationObserver,
    localStorage: {
      getItem() { return settingsRaw },
    },
    addEventListener(type, listener) {
      const list = windowListeners.get(type) || []
      list.push(listener)
      windowListeners.set(type, list)
    },
    removeEventListener(type, listener) {
      const list = windowListeners.get(type) || []
      windowListeners.set(type, list.filter((entry) => entry !== listener))
    },
    focus() {},
  }

  let definition
  window.__ModuleLoader__ = {
    load(value) { definition = value },
  }

  const sandbox = {
    window,
    document,
    navigator,
    Notification: FakeNotification,
    MutationObserver: FakeMutationObserver,
    console,
    setTimeout,
    clearTimeout,
    Map,
    Set,
    Promise,
    JSON,
    Object,
    Array,
    String,
    Number,
    Math,
    Error,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(clientSource, sandbox, { filename: 'client.js' })
  assert.ok(definition, 'client.js must register through __ModuleLoader__')
  assert.equal(definition.id, 'dsh-turn-badge')

  return {
    module: definition.factory(() => { throw new Error('unexpected require') }),
    document,
    window,
    windowListeners,
    Notification: FakeNotification,
    notifications,
    badgeCalls,
  }
}

function createContext(environment) {
  const rows = {
    s1: { sessionId: 's1', title: 'Weekly report', origin: 'user', retainedBy: { mainView: 1 } },
    s2: { sessionId: 's2', title: 'Child task', origin: 'subagent', parentSessionId: 's1' },
  }
  let statuses = new Map([
    ['s1', { running: true, pendingInteraction: undefined, completionUnread: false }],
    ['s2', { running: true, pendingInteraction: undefined, completionUnread: false }],
  ])
  const listeners = new Set()
  const cleanups = []
  let effects = 0

  const ctx = {
    uiSession: {
      sessionStatus: {
        getSnapshot: () => statuses,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    },
    sessions: {
      list: {
        getSnapshot: () => ({
          byId: rows,
          items: Object.values(rows),
          ids: Object.keys(rows),
          phase: 'ready',
        }),
      },
    },
    effect(fn) {
      effects += 1
      cleanups.push(fn())
    },
    get() { return undefined },
  }

  function setRunning(sessionId, running) {
    const next = new Map(statuses)
    const current = next.get(sessionId) || {}
    next.set(sessionId, { ...current, running })
    statuses = next
    for (const listener of [...listeners]) listener()
  }

  function fireWindowEvent(type) {
    for (const listener of [...(environment.windowListeners.get(type) || [])]) listener()
  }

  function dispose() {
    for (const cleanup of cleanups.splice(0)) {
      if (typeof cleanup === 'function') cleanup()
    }
  }

  return { ctx, rows, setRunning, fireWindowEvent, dispose, effects: () => effects }
}

function applyPlugin(environment, context) {
  environment.module.apply(context.ctx)
}

/* -------------------------------- tests -------------------------------- */

test('notifies, badges and marks the title when a background turn finishes', () => {
  const env = createEnvironment()
  const context = createContext(env)
  applyPlugin(env, context)

  context.setRunning('s1', false)

  assert.equal(env.notifications.length, 1)
  assert.equal(env.notifications[0].title, 'Task finished')
  assert.match(env.notifications[0].options.body, /Weekly report/)
  assert.deepEqual(env.badgeCalls.at(-1), ['set', 1])
  assert.equal(env.document.title, '● My Workspace')

  context.fireWindowEvent('focus')
  assert.equal(env.document.title, 'My Workspace')
  assert.deepEqual(env.badgeCalls.at(-1), ['clear'])
  assert.equal(env.notifications[0].closed, true)
})

test('stays quiet when the finished session is the focused main view', () => {
  const env = createEnvironment()
  env.document.hasFocus = () => true
  const context = createContext(env)
  applyPlugin(env, context)

  context.setRunning('s1', false)

  assert.equal(env.notifications.length, 0)
  assert.equal(env.document.title, 'My Workspace')
})

test('ignores subagent completions by default', () => {
  const env = createEnvironment()
  const context = createContext(env)
  applyPlugin(env, context)

  context.setRunning('s2', false)

  assert.equal(env.notifications.length, 0)
  assert.equal(env.badgeCalls.length, 0)
})

test('notifies while focused on a different session', () => {
  const env = createEnvironment()
  env.document.hasFocus = () => true
  const context = createContext(env)
  const rows = {
    s1: { sessionId: 's1', title: 'Weekly report', origin: 'user', retainedBy: { mainView: 0 } },
    s2: { sessionId: 's2', title: 'Child task', origin: 'subagent', parentSessionId: 's1' },
    s3: { sessionId: 's3', title: 'Other session', origin: 'user', retainedBy: { mainView: 1 } },
  }
  context.ctx.sessions.list.getSnapshot = () => ({
    byId: rows,
    items: Object.values(rows),
    ids: Object.keys(rows),
    phase: 'ready',
  })
  applyPlugin(env, context)

  context.setRunning('s1', false)

  assert.equal(env.notifications.length, 1)
  assert.match(env.document.title, /^● /)
})

test('stops notifying after the plugin is disposed', () => {
  const env = createEnvironment()
  const context = createContext(env)
  applyPlugin(env, context)
  context.dispose()

  context.setRunning('s1', false)

  assert.equal(env.notifications.length, 0)
})

test('does nothing when disabled in settings', () => {
  const env = createEnvironment(JSON.stringify({ enabled: false }))
  const context = createContext(env)
  applyPlugin(env, context)

  context.setRunning('s1', false)

  assert.equal(env.notifications.length, 0)
  assert.equal(context.effects(), 0)
})

test('falls back to badge and title when notifications are denied', () => {
  const env = createEnvironment()
  env.Notification.permission = 'denied'
  const context = createContext(env)
  applyPlugin(env, context)

  context.setRunning('s1', false)

  assert.equal(env.notifications.length, 0)
  assert.deepEqual(env.badgeCalls.at(-1), ['set', 1])
  assert.equal(env.document.title, '● My Workspace')
})
