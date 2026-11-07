#!/usr/bin/env node
/**
 * 把 dsh-turn-badge 安装进指定的 DSH profile（默认取 DSH_PROFILE_DIR）。
 *
 * 做四件事：
 *   1. 复制插件到 <profile>/plugins/dsh-turn-badge；
 *   2. 在 profile 的 package.json 里登记 file: 依赖与 bundle；
 *   3. 在 <profile>/node_modules 下建一个链接（失败则退回复制），让宿主能解析；
 *   4. 备份并校验 package.json。
 *
 * 用法：
 *   node install.mjs
 *   node install.mjs --profile C:\Users\me\.dsh\profiles\desktop
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const NAME = 'dsh-turn-badge'
const FILES = ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'install.mjs', 'uninstall.mjs']

function fail(message) {
  console.error(`\n[install] 失败：${message}\n`)
  process.exit(1)
}

function inside(parent, child) {
  const p = resolve(parent)
  const c = resolve(child)
  if (c !== p && !c.startsWith(p + sep)) fail(`拒绝操作 profile 之外的路径：${c}`)
  return c
}

function profileFromArgs() {
  const index = process.argv.indexOf('--profile')
  const explicit = index === -1 ? undefined : process.argv[index + 1]
  if (index !== -1 && !explicit) fail('--profile 后面要跟 profile 目录')
  return resolve(
    explicit
      || process.env.DSH_PROFILE_DIR
      || join(homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE || 'desktop'),
  )
}

function readManifest(profileDir) {
  const file = join(profileDir, 'package.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    fail(`读不了 ${file}：${error.message}`)
  }
}

function backup(file) {
  if (!existsSync(file)) return
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const target = `${file}.bak-turn-badge-${stamp}`
  renameSync(file, target)
  console.log(`[install] 已备份 ${file} -> ${target}`)
}

function copyPlugin(pluginsDir) {
  if (existsSync(pluginsDir)) {
    rmSync(pluginsDir, { recursive: true, force: true })
    console.log(`[install] 覆盖旧版本 ${pluginsDir}`)
  }
  mkdirSync(pluginsDir, { recursive: true })
  for (const file of FILES) {
    const source = join(HERE, file)
    if (!existsSync(source)) fail(`缺少源文件 ${source}`)
    cpSync(source, join(pluginsDir, file))
  }
}

function linkIntoNodeModules(profileDir, pluginsDir) {
  const nodeModules = join(profileDir, 'node_modules')
  mkdirSync(nodeModules, { recursive: true })
  const target = inside(nodeModules, join(nodeModules, NAME))

  if (existsSync(target)) {
    let link = false
    try { link = lstatSync(target).isSymbolicLink() } catch {}
    if (link) {
      try { unlinkSync(target) } catch (error) { fail(`删不掉旧链接 ${target}：${error.message}`) }
    } else {
      rmSync(target, { recursive: true, force: true })
    }
  }

  try {
    symlinkSync(pluginsDir, target, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(`[install] 已链接 ${target}`)
  } catch (error) {
    console.warn(`[install] 建链接失败（${error.message}），改为复制`)
    cpSync(pluginsDir, target, { recursive: true })
  }
}

function updateManifest(profileDir) {
  const file = join(profileDir, 'package.json')
  const manifest = readManifest(profileDir)

  if (!manifest.dependencies || typeof manifest.dependencies !== 'object') manifest.dependencies = {}
  manifest.dependencies[NAME] = `file:plugins/${NAME}`

  if (!manifest.dsh || typeof manifest.dsh !== 'object') manifest.dsh = {}
  if (!manifest.dsh.profile || typeof manifest.dsh.profile !== 'object') manifest.dsh.profile = {}
  const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : []
  if (!bundles.includes(NAME)) bundles.push(NAME)
  manifest.dsh.profile.bundles = bundles

  backup(file)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`[install] 已更新 ${file}`)
}

function verify(profileDir, pluginsDir) {
  const manifest = readManifest(profileDir)
  if (manifest.dependencies?.[NAME] !== `file:plugins/${NAME}`) fail('依赖没有写进 package.json')
  if (!manifest.dsh?.profile?.bundles?.includes(NAME)) fail('bundle 没有写进 package.json')
  for (const file of ['package.json', 'client.js', 'index.js', 'cordis.patch.yml']) {
    if (!existsSync(join(pluginsDir, file))) fail(`安装后缺少 ${join(pluginsDir, file)}`)
  }
  const entry = join(profileDir, 'node_modules', NAME)
  if (!existsSync(join(entry, 'package.json'))) fail(`node_modules 里没有可解析的 ${NAME}`)
}

const profileDir = profileFromArgs()
if (!existsSync(join(profileDir, 'package.json'))) {
  fail(`不是有效的 DSH profile：${profileDir}（没有 package.json）`)
}

const pluginsDir = inside(profileDir, join(profileDir, 'plugins', NAME))
console.log(`[install] profile: ${profileDir}`)

copyPlugin(pluginsDir)
linkIntoNodeModules(profileDir, pluginsDir)
updateManifest(profileDir)
verify(profileDir, pluginsDir)

console.log(`
[install] 完成 ✅

下一步：
  1. 完全退出并重新打开 DeepSeek Harness（宿主只在启动时读取 profile）。
  2. 第一次点击页面时按提示允许通知；macOS 还需在「系统设置 → 通知」里允许 DeepSeek Harness。
  3. 让一个会话在后台跑完，应看到系统通知、应用角标（支持的载体）和标题红点。

如果之后在插件管理里执行 pnpm 安装，file: 依赖仍然有效，不会丢。
`)
