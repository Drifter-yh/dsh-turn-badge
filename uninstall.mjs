#!/usr/bin/env node
/**
 * 从 DSH profile 中移除 dsh-turn-badge。
 *
 * 用法：node uninstall.mjs [--profile <dir>]
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const NAME = 'dsh-turn-badge'

function fail(message) {
  console.error(`\n[uninstall] 失败：${message}\n`)
  process.exit(1)
}

function inside(parent, child) {
  const p = resolve(parent)
  const c = resolve(child)
  if (c !== p && !c.startsWith(p + sep)) fail(`拒绝操作 profile 之外的路径：${c}`)
  return c
}

const index = process.argv.indexOf('--profile')
const explicit = index === -1 ? undefined : process.argv[index + 1]
const profileDir = resolve(
  explicit
    || process.env.DSH_PROFILE_DIR
    || join(homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE || 'desktop'),
)
const manifestFile = join(profileDir, 'package.json')
if (!existsSync(manifestFile)) fail(`不是有效的 DSH profile：${profileDir}`)

const entry = inside(join(profileDir, 'node_modules'), join(profileDir, 'node_modules', NAME))
const pluginsDir = inside(profileDir, join(profileDir, 'plugins', NAME))

if (existsSync(entry)) {
  let link = false
  try { link = lstatSync(entry).isSymbolicLink() } catch {}
  if (link) unlinkSync(entry)
  else rmSync(entry, { recursive: true, force: true })
  console.log(`[uninstall] 已移除 ${entry}`)
}

if (existsSync(pluginsDir)) {
  rmSync(pluginsDir, { recursive: true, force: true })
  console.log(`[uninstall] 已移除 ${pluginsDir}`)
}

const manifest = JSON.parse(readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''))
if (manifest.dependencies && Object.hasOwn(manifest.dependencies, NAME)) delete manifest.dependencies[NAME]
const bundles = manifest.dsh?.profile?.bundles
if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter((name) => name !== NAME)

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
renameSync(manifestFile, `${manifestFile}.bak-turn-badge-${stamp}`)
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`[uninstall] 已更新 ${manifestFile}`)
console.log('[uninstall] 完成，重启 DeepSeek Harness 生效。')
