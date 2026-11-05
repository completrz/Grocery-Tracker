import { readFileSync } from 'node:fs'
import { loadEnv } from 'vite'

// Builds the public pages (privacy policy, terms, support, how to delete your data) from legal/*.html.
// They are plain static pages, so they work without signing in or running any script, which is what the
// app stores and search engines need. Set VITE_CONTACT_EMAIL (and optionally VITE_OPERATOR_NAME) at build time.

const PAGES = [
  ['privacy', 'Privacy policy'],
  ['terms', 'Terms of service'],
  ['support', 'Support'],
  ['delete-account', 'Delete your data'],
]

const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

function render(slug, title, env) {
  const meta = JSON.parse(readFileSync(new URL('./legal/meta.json', import.meta.url), 'utf8'))
  const email = (env.VITE_CONTACT_EMAIL ?? '').trim()
  const contact = email && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)
    ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : '<strong>[contact email not set]</strong>'
  const operator = escapeHtml((env.VITE_OPERATOR_NAME ?? '').trim() || 'the CartTrail operator')
  const body = readFileSync(new URL(`./legal/${slug}.html`, import.meta.url), 'utf8')
    .replaceAll('{{CONTACT}}', contact).replaceAll('{{OPERATOR}}', operator).replaceAll('{{EFFECTIVE}}', escapeHtml(meta.effective))
  const links = PAGES.map(([page, label]) => `<a href="/${page}/"${page === slug ? ' aria-current="page"' : ''}>${label}</a>`).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · CartTrail</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/legal.css">
</head>
<body>
<header class="bar"><div class="wrap"><a class="brand" href="/">
<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill="#1D5C3A"/><path d="M8 6h12v15l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" fill="#fff"/><path d="M11 11h6M11 14.5h4" stroke="#1D5C3A" stroke-width="1.6" stroke-linecap="round"/></svg>
CartTrail</a><a class="open" href="/">Open the app</a></div></header>
<main class="wrap doc">
${body}
</main>
<footer class="wrap foot"><nav aria-label="Legal and support">${links}</nav></footer>
</body>
</html>
`
}

export default function legalPages() {
  let env = {}
  return {
    name: 'carttrail-legal-pages',
    config(_, { mode }) {
      env = loadEnv(mode, process.cwd(), 'VITE_')
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = (request.url ?? '').split('?')[0].match(/^\/(privacy|terms|support|delete-account)\/?$/)
        const page = match && PAGES.find(([slug]) => slug === match[1])
        if (!page) return next()
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(render(page[0], page[1], env))
      })
    },
    generateBundle() {
      if (!env.VITE_CONTACT_EMAIL) this.warn('VITE_CONTACT_EMAIL is not set, so the public pages say "[contact email not set]".')
      for (const [slug, title] of PAGES) this.emitFile({ type: 'asset', fileName: `${slug}/index.html`, source: render(slug, title, env) })
    },
  }
}
