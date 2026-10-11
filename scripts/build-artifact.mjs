// Produce a single-file page fragment for publishing as a claude.ai artifact:
// no doctype/html/head/body (the host wraps it), title + inlined CSS + root + inlined JS.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
const dist = 'dist/assets'
const js = readFileSync(`${dist}/app.js`, 'utf8').replace(/<\/script/gi, '<\\/script')
const css = readdirSync(dist).filter(f => f.endsWith('.css')).map(f => readFileSync(`${dist}/${f}`, 'utf8')).join('\n')
if (!css) throw new Error('no CSS found in dist/assets')
const html = `<title>Sky Joud Simulator</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`
mkdirSync('dist-artifact', { recursive: true })
writeFileSync('dist-artifact/sky-joud-simulator.html', html)
console.log(`dist-artifact/sky-joud-simulator.html ${(html.length / 1024).toFixed(0)} KB`)
