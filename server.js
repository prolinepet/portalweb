process.env.UV_THREADPOOL_SIZE = '128';
require('dotenv').config({ override: false });
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0')
const port = process.env.PORT || 3000
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()
let server = null
let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  if (!server || !server.listening) {
    console.error(`[server] ${signal} received, but server is not running.`)
    process.exit(0)
    return
  }

  server.close((err) => {
    if (err) {
      console.error(`[server] Error during shutdown after ${signal}:`, err)
      process.exit(1)
      return
    }
    process.exit(0)
  })
}

app.prepare().then(() => {
  server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      const { pathname, query } = parsedUrl

      if (pathname === '/a') {
        await app.render(req, res, '/a', query)
      } else if (pathname === '/b') {
        await app.render(req, res, '/b', query)
      } else {
        await handle(req, res, parsedUrl)
      }
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  server.on('error', (err) => {
    console.error('[server] HTTP lifecycle error:', err)
  })

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
}).catch((err) => {
  console.error('[server] Failed to prepare Next app:', err)
  process.exit(1)
})

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
