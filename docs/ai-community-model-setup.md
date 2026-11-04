# 第一次配置真实模型

本机现已配置 DeepSeek，已完成一次真实探测与合成样本调用。以下步骤保留供首次配置或更换服务使用。Mock 只用于验证发帖、任务、记忆和回复流程，不执行“小黄”的人格提示词，不能验收自由聊天、可爱程度或金句质量。此限制已在发现页明确提示。

下面以 DeepSeek 为具体配置例子；不用安装 Python、SDK 或其他依赖。模型 ID 与参数按 2026-11-03 的[官方首次调用文档](https://api-docs.deepseek.com/)和[Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)核对：模型使用 `deepseek-flash`，接口为 `https://api.deepseek.com`，采用 `max_tokens`，本项目对短评论关闭 thinking。供应商的模型名可能以后更新，以控制台与官方文档为准。

## 1. 在你自己的账号创建 API Key

打开 [DeepSeek API Key 控制台](https://platform.deepseek.com/api_keys)，自行注册/登录、创建 API Key。查看控制台当前的计费与余额说明，是否开通或充值由你决定。网页聊天账号本身不会自动把 API Key 配置进这个小程序。

密钥只填下面的本机文件，不发到聊天、不放微信小程序源码、不上传 GitHub。项目 `.gitignore` 已忽略该文件。

## 2. 编辑本机配置

用记事本或编辑器打开：

```text
D:\大三\创\biodiversity-mini-program\server\.env
```

替换对应字段，不要保留两份同名字段；其他 HOST、PORT、开发控制等字段保持原值：

```dotenv
AI_PROVIDER=real
AI_VENDOR=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
AI_API_KEY=把你自己创建的密钥填在这里
AI_TIMEOUT_MS=15000
```

保存。不要把示例中的中文占位文字当成真实密钥。接入后，会将经过过滤的公开帖子文字、少量帖内评论、相关公开话题与核验知识发送给你配置的模型服务；本机观察照片、定位和地图 key 不在请求上下文中。

## 3. 检查填写是否完整

打开 PowerShell：

```powershell
Set-Location 'D:\大三\创\biodiversity-mini-program\server'
node --env-file-if-exists=.env scripts/doctor.js
```

看到 `selectedMode: real`、`vendor: deepseek`、`configured: true` 说明字段已填写。这个检查不发模型请求，也不代表网络、密钥权限和余额已经验证。

## 4. 重启服务并发一次真实测试

如果服务是在你自己的终端启动，在那个终端按 `Ctrl+C`，再运行：

```powershell
Set-Location 'D:\大三\创\biodiversity-mini-program\server'
node --env-file-if-exists=.env src/index.js
```

如果仍在使用我从 Codex 启动的服务，保存后告诉我“配置好了”，我可以重启该服务并核对真实请求；你无需发密钥。

可在另一个 PowerShell 运行一次合成文字探测：

```powershell
Set-Location 'D:\大三\创\biodiversity-mini-program\server'
node --env-file-if-exists=.env scripts/doctor.js --probe
```

`--probe` 最多发送一条合成测试请求，不读取原有观察或发帖缓存。`apiProbe: passed` 表示实际响应和结构检查通过；仍不等于完整语气验收。若出现 `provider_http_401`，核对密钥与权限；429 需核对限额/频率；超时需核对网络。程序只报告错误类别，不打印密钥或供应商原始错误体。

## 5. 回微信开发者工具体验

点击“编译”，回“发现”。顶部应显示“真实模型”；旧 Mock 评论仍保留各自的 Mock 标签，旧版通用套话已撤回，不会被冒充成新模型回复。新帖保持 80% 抽签、8—45 秒延迟、15 分钟初始冷却与每日配额。旧帖子不重抽。

## 6. 进行语气验收

```powershell
node --env-file-if-exists=.env scripts/tone.js
```

脚本会对 36 类合成场景逐条调用真实模型；注入、隐私或空上下文的边界项可能在调用前被拦截，报告会区分。每一条已接受的真实输出会进入后续测试的近期评论，用于检查重复；不写入共享记忆。结果在 Git 忽略的 `server/reports/tone-real.json`。

人工给各项 `ratings` 填 1—5 分，明确设置 `criticalIssue: false` 或 `true`，然后运行：

```powershell
node scripts/score-tone.js
```

至少 30 条真实评论、评分与原始修复记录的重大问题检查完整、平均至少 4 分、无校验失败和重大问题才会标为通过。没有真实报告、使用 Mock 或留空评分不会通过。任何泄露、虚构来源、危险诱导或冒充真人都需要单独修复，不能被平均分抵消。

## 使用已有 OpenAI 接口

适配器也保留 OpenAI Chat Completions 协议：`AI_VENDOR=openai`、`AI_BASE_URL=https://api.openai.com/v1`，模型 ID 填你账户实际可用且支持 JSON 模式的模型。此路径使用 `max_completion_tokens`，不会把 DeepSeek 特有的 thinking 参数发送给 OpenAI。JSON 模式和 schema 的区别见 [OpenAI 官方文档](https://developers.openai.com/api/docs/guides/structured-outputs)。不能保证任意第三方兼容接口都支持同一参数组合。
