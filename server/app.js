import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Koa from 'koa'
import cors from '@koa/cors'
import Router from '@koa/router'
import serve from 'koa-static'
import { fetchIndustryBoards, fetchQuotes, fetchStockSuggestions, fetchTrend } from './services/eastmoney.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

const app = new Koa()
const router = new Router({ prefix: '/api' })

app.use(async (ctx, next) => {
  try {
    await next()
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = {
      message: error.message || '服务器内部错误',
    }
  }
})

app.use(cors())

router.get('/health', (ctx) => {
  ctx.body = {
    ok: true,
    timestamp: new Date().toISOString(),
  }
})

router.get('/quotes', async (ctx) => {
  ctx.body = {
    updatedAt: new Date().toISOString(),
    items: await fetchQuotes(ctx.query.codes),
  }
})

router.get('/search/stocks', async (ctx) => {
  ctx.body = {
    updatedAt: new Date().toISOString(),
    items: await fetchStockSuggestions(ctx.query.query),
  }
})

router.get('/trend/:code', async (ctx) => {
  ctx.body = await fetchTrend(ctx.params.code, ctx.query.period || 'intraday')
})

router.get('/market/industries', async (ctx) => {
  ctx.body = {
    updatedAt: new Date().toISOString(),
    items: await fetchIndustryBoards(ctx.query.limit),
  }
})

app.use(router.routes())
app.use(router.allowedMethods())

if (fs.existsSync(distDir)) {
  app.use(serve(distDir))
  app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api')) {
      await next()
      return
    }

    ctx.type = 'html'
    ctx.body = fs.createReadStream(path.join(distDir, 'index.html'))
  })
}

function isEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isEntrypoint()) {
  const port = Number(process.env.PORT || 3000)
  app.listen(port, () => {
    console.log(`API server running at http://localhost:${port}`)
  })
}

export default app