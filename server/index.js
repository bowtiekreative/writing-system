import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'

import apiRoutes from './routes/api.js'
import siteRoutes from './routes/site.js'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'

const app = Fastify({
  logger: process.env.NODE_ENV === 'production'
    ? { level: process.env.LOG_LEVEL ?? 'info' }
    : { level: process.env.LOG_LEVEL ?? 'info', transport: undefined },
  trustProxy: true,
  bodyLimit: 1_048_576
})

// The engine page posts a plain HTML form, so it must work without JavaScript.
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
  try {
    const params = new URLSearchParams(body)
    const out = {}
    for (const [k, v] of params) out[k] = v
    done(null, out)
  } catch (err) {
    done(err)
  }
})

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['content-type']
})

await app.register(fastifyStatic, {
  root: join(here, '..', 'public'),
  prefix: '/',
  index: false,
  decorateReply: false,
  maxAge: '1h'
})

await app.register(apiRoutes)
await app.register(siteRoutes)

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, 'request failed')
  const code = err.statusCode ?? 500
  if (req.url.startsWith('/v1/')) {
    return reply.code(code).send({ error: code === 500 ? 'internal_error' : 'request_error', message: err.message })
  }
  return reply.code(code).type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>Error</title><p>${code}</p>`)
})

try {
  await app.listen({ port: PORT, host: HOST })
  app.log.info(`writing system api listening on ${HOST}:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, closing`)
    await app.close()
    process.exit(0)
  })
}
