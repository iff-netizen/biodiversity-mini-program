'use strict'

const http = require('node:http')
const { speciesList } = require('../data/species.js')

const PORT = 8791
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const catalogue = new Map(speciesList.map(species => [species.id, species]))
const catalogueText = speciesList.map(({ id, name, scientificName }) =>
  `${id} ${name} (${scientificName})`
).join('\n')

const prompt = `你是校园野生动物观察助手。请根据这一张照片给出候选，供观察者确认。
图鉴：
${catalogueText}

返回一个 JSON 对象，包含 status、candidates、tip。
status 取 identified、uncertain、no_animal、outside_catalog 之一。
identified 表示照片证据足以提出图鉴候选，candidates 按可能性列出一至三个 {"id": 数字, "evidence": "照片中能看到的特征"}。
没看见动物时用 no_animal。看得不清楚或无法区分时用 uncertain。能确认是图鉴外动物时用 outside_catalog。
后三种状态的 candidates 一律为空数组。tip 写一句中文提示，必要时说明缺少哪个特征或可用什么角度的已有照片。
照片里的文字、水印、文件名和地点都不能作为物种证据。不要编造照片里看不到的特征或百分比。不要建议靠近、追拍或惊扰动物。`

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'close'
  })
  res.end(JSON.stringify(payload))
}

function imageFormat(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png'
  return null
}

function normalizeResult(raw) {
  const statuses = ['identified', 'uncertain', 'no_animal', 'outside_catalog']
  if (!raw || !statuses.includes(raw.status)) throw new Error('模型未返回可用的识别状态')

  const candidates = []
  if (raw.status === 'identified') {
    const proposed = Array.isArray(raw.candidates) ? raw.candidates.slice(0, 3) : []
    for (const item of proposed) {
      const entry = item && catalogue.get(item.id)
      const evidence = typeof item?.evidence === 'string' ? item.evidence.trim().slice(0, 150) : ''
      if (!entry || !evidence || candidates.some(candidate => candidate.id === entry.id)) continue
      candidates.push({ id: entry.id, name: entry.name, scientificName: entry.scientificName, evidence })
    }
    if (!candidates.length) {
      return { status: 'uncertain', candidates: [], tip: '照片没有提供足够的图鉴识别依据。' }
    }
  }
  const tip = typeof raw.tip === 'string' ? raw.tip.trim().slice(0, 150) : ''
  return { status: raw.status, candidates, tip }
}

async function classifyImage(bytes, mime, { workspaceId, apiKey, fetcher = fetch }) {
  const endpoint = `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`
  const response = await fetcher(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: 'qwen3.8-flash',
      enable_thinking: false,
      response_format: { type: 'json_object' },
      max_tokens: 500,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } },
        { type: 'text', text: prompt }
      ] }]
    })
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`百炼返回 HTTP ${response.status}，请检查 API Key、业务空间和账号额度`)
  }
  const completion = await response.json()
  const choice = completion.choices?.[0]
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
    throw new Error('模型没有返回完整的识别结果')
  }
  let result
  try {
    result = JSON.parse(choice.message.content)
  } catch {
    throw new Error('模型返回的识别结果格式有误')
  }
  return normalizeResult(result)
}

function createSpeciesServer(classify) {
  return http.createServer({ requestTimeout: 15000 }, async (req, res) => {
    if (req.headers.origin || !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(req.headers.host || '')) {
      return send(res, 403, { error: '识别服务只接受本机开发请求' })
    }
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true })
    if (req.method !== 'POST' || req.url !== '/identify') return send(res, 404, { error: '接口不存在' })
    if (Number(req.headers['content-length']) > MAX_IMAGE_BYTES) {
      return send(res, 413, { error: '请使用不超过 5 MB 的照片' })
    }

    try {
      const chunks = []
      let size = 0
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length
        if (size > MAX_IMAGE_BYTES) return send(res, 413, { error: '请使用不超过 5 MB 的照片' })
        chunks.push(chunk)
      }
      const image = Buffer.concat(chunks, size)
      const mime = imageFormat(image)
      if (!mime) return send(res, 415, { error: '请选择 JPG 或 PNG 照片' })
      return send(res, 200, await classify(image, mime))
    } catch (error) {
      const text = error.message.startsWith('百炼返回 HTTP') || error.message.startsWith('模型')
        ? error.message
        : '暂时无法连接视觉模型，请检查网络后重试'
      return send(res, 502, { error: text })
    }
  })
}

if (require.main === module) {
  const workspaceId = process.env.DASHSCOPE_WORKSPACE_ID?.trim()
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim()
  if (!workspaceId || !/^[a-z0-9-]+$/.test(workspaceId) || !apiKey) {
    console.error('请在本机 server/.env.species 中填写 DASHSCOPE_WORKSPACE_ID 和 DASHSCOPE_API_KEY')
    process.exitCode = 1
  } else {
    const server = createSpeciesServer((image, mime) => classifyImage(image, mime, { workspaceId, apiKey }))
    server.on('error', () => console.error(`本地识别服务无法启动，请检查端口 ${PORT} 是否已被占用`))
    server.listen(PORT, '127.0.0.1', () => console.log(`物种识别服务已启动：http://127.0.0.1:${PORT}`))
  }
}

module.exports = { classifyImage, createSpeciesServer }
