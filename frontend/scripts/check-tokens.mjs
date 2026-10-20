// Token-Wächter: verbietet Alt-Grau, große Rundungen und Akzent-Tönungen in der App-Oberfläche.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXCLUDE = [
  'src/pages/MonitorPage.jsx',
  'src/pages/AufgabenMonitorPage.jsx',
  'src/components/display/',
  'src/pages/DesignTestPage.jsx',
]

const PATTERNS = [
  /\b(?:bg|text|border|ring|divide|from|to|via|placeholder|outline|fill|stroke)-gray-\d{2,3}\b/g,
  /\brounded-(?:xl|2xl|3xl)\b/g,
  /\b(?:bg|ring|border)-accent\/\d+\b/g,
]

const EXTENSIONS = ['.js', '.jsx', '.css']

export function findViolations(source, filePath) {
  const violations = []
  let inLegacy = false
  source.split('\n').forEach((text, i) => {
    if (text.includes('legacy-gray:start')) { inLegacy = true; return }
    if (text.includes('legacy-gray:end')) { inLegacy = false; return }
    if (inLegacy) return
    let code = text.trim()
    if (code.startsWith('//') || code.startsWith('*')) return
    if (code.startsWith('/*')) {
      const end = code.indexOf('*/')
      if (end === -1) return
      code = code.slice(end + 2)
    }
    for (const re of PATTERNS) {
      for (const m of code.matchAll(re)) violations.push({ line: i + 1, match: m[0] })
    }
  })
  return violations
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((e) => name.endsWith(e))) out.push(full)
  }
  return out
}

function main() {
  const root = process.env.CHECK_TOKENS_ROOT
    ? resolve(process.env.CHECK_TOKENS_ROOT)
    : resolve(fileURLToPath(import.meta.url), '..', '..')
  const args = process.argv.slice(2)
  const idx = args.indexOf('--only')
  const only = idx === -1 ? [] : args.slice(idx + 1).filter((a) => !a.startsWith('--'))
  const norm = (p) => p.split(sep).join('/').replace(/^\.\//, '')
  const onlyPrefixes = only.map(norm)
  if (idx !== -1 && !onlyPrefixes.length) {
    console.error('Fehler: --only erwartet mindestens einen Pfad.')
    process.exit(2)
  }

  const allFiles = walk(join(root, 'src'), [])
    .map((f) => norm(relative(root, f)))
    .filter((f) => !EXCLUDE.some((x) => f === x || (x.endsWith('/') && f.startsWith(x))))
    .sort()
  const matches = (f, p) => f === p || f.startsWith(p.endsWith('/') ? p : p + '/')
  const unmatched = onlyPrefixes.filter((p) => !allFiles.some((f) => matches(f, p)))
  if (unmatched.length) {
    for (const p of unmatched) console.error(`Fehler: --only Pfad trifft keine Datei: ${p}`)
    process.exit(2)
  }
  const files = onlyPrefixes.length ? allFiles.filter((f) => onlyPrefixes.some((p) => matches(f, p))) : allFiles

  let count = 0
  for (const f of files) {
    for (const v of findViolations(readFileSync(join(root, f), 'utf8'), f)) {
      console.log(`${f}:${v.line}: ${v.match}`)
      count++
    }
  }
  console.log(count ? `${count} Verstöße in ${files.length} Dateien geprüft.` : `Sauber: ${files.length} Dateien geprüft.`)
  process.exit(count ? 1 : 0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
