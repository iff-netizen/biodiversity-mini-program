'use strict'
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process'), vm = require('node:vm')
const root = path.resolve(__dirname, '../..')
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules', 'var', 'reports'].includes(entry.name)) return []
    const filename = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(filename) : [path.relative(root, filename).replace(/\\/g, '/')]
  })
}
const files = walk(root), errors = []
for (const filename of files) {
  if (filename === 'config/config.js' || filename === 'project.private.config.json' || /(?:^|\/)\.env(?:\.|$)/.test(filename)) continue
  const absolute = path.join(root, filename)
  if (filename.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', absolute], { encoding: 'utf8' })
    if (result.status !== 0) errors.push(filename + ': ' + result.stderr)
  }
  if (filename.endsWith('.json')) {
    try { JSON.parse(fs.readFileSync(absolute, 'utf8')) } catch { errors.push(filename + ': invalid JSON') }
  }
  if (filename.endsWith('.wxml')) {
    const source = fs.readFileSync(absolute, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    const stack = [], token = /<(\/?)([\w-]+)\b[^>]*>/g
    let match
    while ((match = token.exec(source))) {
      if (match[1]) { if (stack.pop() !== match[2]) errors.push(filename + ': unbalanced ' + match[2]) }
      else if (!match[0].endsWith('/>')) stack.push(match[2])
    }
    if (stack.length) errors.push(filename + ': unclosed tags ' + stack.join(','))
    const script = filename.replace(/\.wxml$/, '.js')
    if (fs.existsSync(path.join(root, script))) {
      let page
      const js = fs.readFileSync(path.join(root, script), 'utf8')
      // Evaluate page and component definitions with inert imported modules.
      try {
        vm.runInNewContext(js, {
          Page: value => { page = value },
          Component: value => { page = value.methods },
          require: () => ({}), wx: { canIUse: () => true }, console
        })
        for (const handler of source.matchAll(/\b(?:bind|catch)(?::)?[\w-]+=["']([\w]+)["']/g)) {
          if (!page || typeof page[handler[1]] !== 'function') errors.push(filename + ': missing event handler ' + handler[1])
        }
      } catch (error) { errors.push(script + ': definition error ' + error.message) }
    }
  }
}
const ignore = project.packOptions.ignore
const packaged = files.filter(file => !ignore.some(rule => rule.type === 'folder' ? file === rule.value || file.startsWith(rule.value + '/') : rule.type === 'file' && file === rule.value))
const prohibited = packaged.filter(f => /^(?:server|docs|\.git)\//.test(f) || /\.(?:sqlite|log)$/.test(f) || /(?:^|\/)\.env/.test(f))
if (prohibited.length) errors.push('Backend/private files in pack manifest: ' + prohibited.join(','))
if (!ignore.some(rule => rule.type === 'folder' && rule.value === 'server')) errors.push('server must be excluded as an entire folder')
for (const required of ['pages/assistant/assistant.wxml', 'components/assistant-fab/assistant-fab.wxml', 'shared/assistant/catalog.js', 'shared/assistant/retrieval.js']) {
  if (!packaged.includes(required)) errors.push('Assistant file missing from pack manifest: ' + required)
}
const report = { node: process.version, checkedFiles: files.length, packagedFiles: packaged.filter(f => !f.startsWith('.')).length, serverExcluded: !packaged.some(f => f.startsWith('server/')), errors,
  boundary: 'Static JS/JSON/WXML/event-handler and packOptions manifest check; not a WeChat compiler/package run.' }
fs.mkdirSync(path.join(root, 'server/reports'), { recursive: true })
fs.writeFileSync(path.join(root, 'server/reports/static-check.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
