# 小黄 AI 助手本地体验

## 三分钟体验

1. 在微信开发者工具打开本项目并编译，选择底部「地图」。拖动黄色小黄，松手后位置会保留；轻点进入助手。
2. 点「怎么记录一次自然观察？」会直接收到「功能指南」。点「去识别页」，再从「地图」或「我的 → AI 助手 → 打开 AI 助手」回来，原会话和草稿会恢复。
3. 启动本地服务后，问「为什么不要给野生动物投喂？」或「我今天有点累」。首次在线发送会显示数据处理说明，访客需要先选择本地体验身份。回复标记为「AI 回答」或「演示回复」。
4. 在「我的 → AI 助手」关闭「显示首页助手」，仍可使用固定入口。聊天页右上角可新建、恢复近期会话或清空当前身份的本机记录。

## 启动与配置

在 PowerShell 中进入 `server`，使用 Node.js `>=24.22.1 <25`。现有私密 `server/.env` 可以直接沿用。没有该文件时，可复制 `.env.example` 到 `.env`，按需填写本机配置。

```powershell
node --env-file-if-exists=.env src/index.js
```

这个命令与 `npm start` 相同。默认地址是 `http://127.0.0.1:8787`，和 `config/community.example.js` 一致。若在新工作区运行且识别页缺少旧的本机地图配置文件，先按项目已有流程从 `config/config.example.js` 创建 `config/config.js`。助手只需要社区服务的地址和已有开发身份。

```dotenv
AI_PROVIDER=real
AI_VENDOR=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
# AI_API_KEY 只在私密的 server/.env 填写
```

设置 `AI_PROVIDER=mock` 可以查看演示状态。真实请求失败时会显示错误及重试入口。固定指南可以在停止服务后继续体验。助手默认上游超时 25 秒，客户端请求超时 35 秒；其余限额见 `server/.env.example`。同一个 Node 进程内，助手和社区共用供应商每小时预算，助手另有并发及次数上限。

## 验证命令

```powershell
node --test tests/*.test.js
node scripts/check.js
node --env-file=.env scripts/assistant-smoke.js
```

前两条分别等价于 `npm test` 和 `npm run check`。第三条使用内存 SQLite，通过新助手 HTTP 接口发送合成问题。正常情况下有 6 条功能指南和 5 次真实生成；加 `--multi-turn-only` 时仅运行两条合成多轮消息。现有本机社区数据库不参与冒烟测试。

## 修改功能指南

- 在 `shared/assistant/catalog.js` 更新功能条目、稳定 ID、匹配词、已核对的步骤、限制和源码位置。公开能力写 `available`，模拟能力写 `demo`，未提供的能力写 `unavailable`。修改功能事实时更新知识版本与核验日期。
- `shared/assistant/retrieval.js` 是小程序和服务端共用的检索入口。单一且明确的问题优先走离线指南。需要综合说明的问题会给 DeepSeek 提供命中的条目。新的导航动作要对应已注册页面，并同时经过服务端与小程序校验。
- `components/assistant-fab/` 用固定尺寸的 `cover-view` 覆盖原生地图区域；`pages/assistant/` 管理聊天、历史、状态和输入。导航只在用户点按钮时发生。
- `server/src/assistant/` 管理会话输入、回复校验、模型配额和断开取消；`server/prompts/assistant-bot.md` 是独立运行时提示词。社区和助手共用模型连接配置及 HTTP 调用。

## 本机记录与运行边界

聊天记录和草稿按 A、B、C、访客隔离。每个身份最多保留 10 个近期会话，每个最多 100 条消息，读取时淘汰 7 天前的记录，空间不足时优先淘汰旧会话。发送给模型的历史最多 12 条已完成消息，另有总长度限制。首页只传受控页面 ID；照片、观察坐标、历史观察和社区帖子不随请求发送。服务器不写入聊天正文，回复只为短时去重而暂存在内存。清空仅删除当前身份的本机聊天和草稿。

识别依然是模拟结果。A/B/C 是本地开发身份。服务默认监听电脑回环地址，手机不能用手机自己的 `127.0.0.1` 访问这项服务。真机验证和正式使用需要单独配置真实身份与网络环境。

[DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) · [微信 map 组件](https://developers.weixin.qq.com/miniprogram/dev/component/map.html) · [微信 cover-view 组件](https://developers.weixin.qq.com/miniprogram/dev/component/cover-view.html)
