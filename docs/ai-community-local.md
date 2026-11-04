# AI 社区评论员：本地开发说明

交付日期：2026-11-03。原生微信小程序 + Node.js 24.22.1 + 内置 `node:sqlite`，没有第三方运行依赖。功能分支为 `feat/ai-community-local`，基线 `0a4d6fde1732867f4bb33419ea898e87f55e71b0`。本地体验后用户已明确要求上传，本次按功能分支提交和推送；不合并 main、不部署或发布小程序。PR 说明目前仅为草稿。

## 本机启动

本机 Codex 终端可用 `node`，没有发现可直接调用的 `npm`。下列命令不需要安装依赖，也不需要 npm：

```powershell
Set-Location 'D:\大三\创\biodiversity-mini-program\server'
node --version
# 应为 v24.22.1；兼容范围 >=24.22.1 <25
# 仅第一次创建；已有 .env 不会被覆盖
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
node --env-file-if-exists=.env src/index.js
```

如果你的外部 PowerShell 找不到 `node`，本机现有可执行文件为：

```powershell
& 'C:\Users\geadmin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --env-file-if-exists=.env src/index.js
```

保持终端打开。在该终端按 `Ctrl+C` 停止；重新执行相同启动命令会恢复数据库和持久任务。不要同时启动两个监听相同端口的服务。数据库默认在 `server/var/community.sqlite`，WAL/SHM 文件由 SQLite 管理，不要手动清空。服务默认只监听 `127.0.0.1:8787`。

另开 PowerShell 进行检查：

```powershell
Invoke-RestMethod 'http://127.0.0.1:8787/health'
Set-Location 'D:\大三\创\biodiversity-mini-program\server'
node --test tests/*.test.js
node scripts/check.js
```

提供了 `package.json` 和无外部依赖的 `package-lock.json`。有 npm 的环境可使用 `npm ci --ignore-scripts`、`npm test`、`npm start`；当前本机已验证的是上面的直接 Node 命令。

## 微信开发者工具

1. 导入 `D:\大三\创\biodiversity-mini-program`，使用现有 `project.config.json`。开发者身份/扫码登录由你操作。
2. 当前前端开发配置位于 `config/community.example.js`，实际被服务模块导入：`API_BASE_URL` 为 `http://127.0.0.1:8787`。这里仅有非敏感配置，不能放模型密钥。
3. 在微信开发者工具中按当前版本的本地调试选项允许开发环境请求该 HTTP 地址，然后编译；这是开发期设置，不能视为正式版网络配置。本次没有操作这些安全/网络设置，也没有实际运行微信编译器。
4. 打开发现页：广场自由发帖、我的动态、本机观察。到“我的 → 社区互动”切换 A/B/C 身份、关闭互动或查看本机开发诊断。
5. 发现页可见时每 5 秒拉取当前页；隐藏或卸载页面停止轮询。下一页使用服务端游标；“回到最新”恢复第一页。

后续本地体验中已检测到你安装并打开微信开发者工具，用户截图证实广场和 AI 评论基本显示。本轮自动窗口捕获报 `FrameArrived timed out`，因此没有独立完成微信编译、全页布局或手机联调。静态标签/事件检查和页面 JS 模拟不等价于微信模拟器完整验收。

手机上的 `127.0.0.1`/`localhost` 是手机自身。首版开发会话与诊断只对桌面回环请求开放，不能直接改成局域网地址就声称手机联调完成。以后如需手机联调，应另外配置受控会话签发与局域网访问；公网运行还需要 HTTPS、微信合法域名和真实鉴权。本次不开放公网隧道。

## Mock 与真实模型

默认 `.env.example` 使用 `AI_PROVIDER=mock`，发现页明确提示尚未连接真实模型，每条 Mock AI 评论标明演示。Mock 是有限的确定性功能夹具，不执行人格提示词，未知输入跳过，不能代表正式语气。本轮已删除“截取原文+通用日记口号”的缺陷兜底并撤回已知旧 v1 套话评论。切换模式不会把已存在的 Mock 评论伪装成真实模型输出。

首次配置可直接按 [模型配置指南](ai-community-model-setup.md) 操作，含 DeepSeek 当前模型名、独立协议参数、自检和一次真实调用。不要把 Key 发到聊天。

真实模型在本机 `server/.env` 配置，**不要把密钥发到聊天里**：

```dotenv
AI_PROVIDER=real
AI_VENDOR=openai
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=填写你账户可用且支持JSON模式的模型ID
AI_API_KEY=仅在此本机文件填写
AI_TIMEOUT_MS=15000
```

OpenAI 路径最少需要 `AI_PROVIDER=real`、`AI_MODEL`、`AI_API_KEY`；官方端点可使用默认地址。适配器使用 Chat Completions 的 `messages`、`response_format: {type: 'json_object'}`；OpenAI 使用 `max_completion_tokens: 800`，DeepSeek 使用 `max_tokens: 800` 并关闭 thinking，高优先级人格与结构化用户数据分离。两种协议已用模拟响应测试，不等于外网调用已经通过，也不保证任意“兼容”供应商都支持所有字段。

修改后重启服务。缺密钥/模型 ID、超时、429、网络错误、输出校验失败均静默跳过或有限重试，不切换 Mock。每个任务最多 2 次调用，15 秒默认超时，90 次/小时全局调用上限，最多 60 条 AI 评论/小时。调用次数和单次输出长度限制用于控制成本；本地版没有按货币计价的账单预算或结算功能。

真实语气验收脚本只使用合成匿名夹具，不读取你的观察缓存：

```powershell
Set-Location 'D:\大三\创\biodiversity-mini-program\server'
node --env-file-if-exists=.env scripts/tone.js
```

36 类帖子在 `server/fixtures/tone-posts.json`。结果逐条保存到被 Git 忽略的 `server/reports/tone-real.json`，记录模型、提示词版本、结构化输入、原始输出、用量和校验结果。接受的真实输出进入后续案例近期评论，AI 内容不进入共享记忆。隐私/注入内容可能在模型调用前被拦截，该行会明确标为 `blocked_before_model`；不能当作模型输出。评分默认留空，需你按贴合度、自然感、轻快可爱、不过度打扰、知识可靠性各 1—5 分填写，并明确标记 criticalIssue。`node scripts/score-tone.js` 要求至少 30 条真实评论、评分完整、平均至少 4 分、无校验失败或重大问题。当前已配置 DeepSeek 并生成真实调试样本：31 条评论、2 条模型 skip、3 条输入拦截；人工评分仍待完成。

## 策略与开发控制

策略集中于 `server/src/config.js`，当前策略版本 `policy-2`；人格提示词为 `server/prompts/community-bot.md`（`personality-3`）。按本地体验反馈，发帖基础概率与上限均调为 0.80，下限 0.20；热点加分仍受上限限制，因此目前合格普通帖和相关热点帖均为 80%。直接回复 AI 的候选概率仍为 0.60。初始冷却 15 分钟、跟帖短冷却 30 秒；每帖初始一次、跟帖一次；每位互动目标用户每天最多 6 条，日期按 Asia/Shanghai 计算。新策略仅影响之后创建的事件，不重新抽取旧帖。UTC 毫秒时间存储于后端，页面按本地时间显示。

不合格/配额/冷却先过滤，再抽签。`@` 在特征与话题计算中移除；不建立 @ 必回。每个事件只有一个持久决策，编辑/刷新/重启不会重新抽签。命中后 8—45 秒延迟；过期 6 小时的任务不补发。领取、租约和最终落库采用短事务，模型调用期间不持有数据库事务；最后再次检查帖子版本、开关、配额、来源和近似重复。数据库唯一约束兜底幂等。

显式 `APP_MODE=development`，且 `DEV_CONTROLS=true` 才允许测试控制。开发端点还要求回环连接和开发会话。`AI_ENABLED=false` 是全局开关。`DEV_RANDOM_SEED` 可固定 RNG；开发接口也支持 `randomSeed` 与 `advanceMs`，单次最多推进一天。手动时钟偏移仅保存在本次进程，重启清零；正常任务与真实服务时间持久保存，不依赖该偏移。建议自动化测试用隔离临时数据库，避免人为推进影响日常体验。

强制命中只允许 `testNamespace=demo:...` 的开发数据，不绕过开关/安全/用户与全局配额，仅绕过随机命中和冷却；诊断显示 `force_test`。正常发帖概率没有改为 100%。

## 记忆、来源与撤回

首版采用规则提取和标签/中文关键词检索，不调用另一个模型生成记忆摘要。摘要是截短、经过隐私过滤的公开叙述，标记为 `public_anecdote`，不会升级成科学事实。精确坐标、联系信息、凭据、可识别私人叙述和指令注入候选被拒绝/排除；这是一套偏保守的本地过滤器，不等于完整生产内容审核。

`community_memories` 与 `memory_sources` 分表，来源 ID 包含帖子版本。最多取 4 条相关记忆，排除当前作者和当前帖子；没有相关内容则不用。默认 TTL 14 天；一个人重复发帖不会增加独立作者数。热点按近 7 天来源计算衰减，同时报告 24 小时独立作者；至少两个独立真人作者才构成热点。AI 内容不入库，不导入历史监测点。

删帖、转私密、编辑或撤回记忆许可时立即撤销旧版本来源，重算剩余摘要与作者数，并隐藏依赖它的既有 AI 评论（保守记录所有进入生成上下文的记忆来源，避免模型漏报引用；可能一并隐藏最终未明显引用该来源的评论）；该帖自身的 AI 评论也会撤回。生成中的任务检查所有已经进入上下文的记忆来源，即使输出没有声明引用，也不允许继续传播失效上下文。重新公开/重新允许记忆会建立新版本来源，但不重新抽签，也不会恢复旧评论。

动物知识单独存于 `server/data/verified-facts.json`，仅有少量带链接和核验日期的观察建议。科普可使用核验原句或人工核对的自然短表达，不放行追加的未核对保护等级或鉴定结论；普通风格也有事实与危险表达过滤。广泛的自由科学释义尚未实现。`data/species.js` 的未核对字段不进入知识库。

## 观察、缓存和图片边界

- 自由文字 Post 与个人 Observation 分开，不增加观察次数或图鉴解锁。
- 历史 `observations`、`interactions` 不清空、不批量上传；“本机观察”保留本地互动。网络失败保留独立身份的发帖草稿与请求幂等键。
- 保存观察后可选择补充文字分享；不分享继续留在原地图/图鉴/统计流程。当前动物识别依然是模拟结果，经用户确认不代表专业鉴定。
- 分享只传文字、用户填写物种和字符串 observationId，不传照片、置信度、地址或坐标。共享图片上传/EXIF 清除未实现、未验收。
- 在新功能中尝试分享观察时，本机会记录对应开发身份。删除该观察时先用各自的开发会话删除其关联动态，再删除个人记录与本机互动；服务离线/关联删除失败时保留个人观察并提示重试。部分已经成功删除的动态不会自动恢复。单独删除动态始终保留个人观察。
- 不同开发身份共用这台设备原来的个人观察缓存，身份切换只模拟社区用户，不能包装成多账户的真实个人数据隔离。

## 数据、打包与生产边界

SQLite 启动执行 `server/src/db/schema.sql` 与幂等迁移记录，目前版本 1（核心表）、2（模型模式与型号元数据）、3（仅撤回已知旧 Mock 套话，保留原帖和真人评论）。全库包含开发用户/会话、帖子、评论、互动、持久任务、调用预算、记忆/来源、依赖引用、偏好、隐藏状态与反馈。会话 token 只存哈希，不能靠请求中的 authorId/authorType 指定身份。

`project.config.json` 的 `packOptions.ignore` 整目录排除 `server`、`docs`、`.git`。`node scripts/check.js` 枚举文件并检查排除范围，不读取 `config/config.js` 或 `.env` 的凭据值。实际微信预览/上传包仍待开发者工具确认；检查不能替代微信打包器。

`.env`、SQLite/WAL/SHM、日志、评测原始输出都在 `.gitignore` 中。正式环境关闭 dev 路由和开发 token，当前没有真实微信鉴权，因此生产 API 拒绝开发身份，不具备上线条件。保持本地体验阶段。

## 官方参考

- [OpenAI：结构化输出与 JSON 模式](https://developers.openai.com/api/docs/guides/structured-outputs)；JSON 有效不等于符合 schema，因此后端独立校验。
- [Node SQLite 文档](https://nodejs.org/api/sqlite.html)。当前在线默认页已是较新 Node 主版本，本项目以本机 Node 24.22.1 的实际 `DatabaseSync` 能力和测试为准，没有照搬新主版本 API。
- [微信网络能力](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。本次工具未能获取此页；当前版本调试选项需在微信开发者工具现场核对。
- [NPS：安全观察野生动物](https://www.nps.gov/subjects/watchingwildlife/7ways.htm)。只采用一般非干扰观察建议，不将美国公园规则当作中国法规。
