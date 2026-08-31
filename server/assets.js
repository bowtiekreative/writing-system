/**
 * Content-hashed asset URLs.
 *
 * Shared CSS and JS are fingerprinted at boot and served immutable, so a cached copy can
 * never go stale and a new deploy busts the cache on its own.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(here, '..', 'public')

function fingerprint (filename, type) {
  const body = readFileSync(join(PUBLIC_DIR, filename))
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12)
  const [name, ext] = filename.split(/\.(?=[^.]+$)/)
  return { filename, url: `/${name}.${hash}.${ext}`, body, type, hash }
}

export const ASSETS = {
  css: fingerprint('laka.css', 'text/css; charset=utf-8'),
  js: fingerprint('site.js', 'text/javascript; charset=utf-8')
}

export const ASSET_BY_URL = new Map(Object.values(ASSETS).map((a) => [a.url, a]))
