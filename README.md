# 共栖智护 · 生物多样性微信小程序

原生微信小程序，包含地图、模拟识别与人工确认、个人观察、图鉴、物种详情，以及本地社区和 AI 评论员“小黄”。前端保持 JS/WXML/WXSS/JSON；本地后端使用 Node.js 24.22.1 与内置 SQLite，没有第三方运行依赖。

## 克隆后的本地启动

在仓库目录打开 PowerShell，首次准备本机配置：

```powershell
if (!(Test-Path -LiteralPath 'config/config.js')) { Copy-Item -LiteralPath 'config/config.example.js' -Destination 'config/config.js' }
Set-Location server
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
node --env-file-if-exists=.env src/index.js
```

需要 Node `>=24.22.1 <25`。默认 `127.0.0.1:8787`，默认 Mock 功能演示；真实模型仅在本机 `server/.env` 配置。终端 `Ctrl+C` 停止，再次启动保留 SQLite 数据和任务。地图 key 按需在本机 `config/config.js` 填写。

微信开发者工具导入仓库根目录，读取 `project.config.json`；按工具当前版本设置本地 HTTP 调试后编译。发现页支持自由文字发帖；“我的 → 社区互动”可切换 A/B/C 开发身份。此身份机制只用于本机测试，正式微信鉴权尚未接入。手机上的 localhost 不指向电脑，真机网络需另行配置。

```powershell
# 在 server 目录
node --test tests/*.test.js
node scripts/check.js
```

## AI 评论与验证范围

- 合格新帖 80% 触发，延迟 8—45 秒；初始冷却 15 分钟，仍有日/小时配额。@ 不影响触发；真人直接回复 AI 后最多再接一轮。
- 公开话题存在服务端，记录真实来源；删除、编辑、转私密或撤回许可会取消旧任务并撤回相关 AI 引用。AI 内容不进入共享记忆。
- 纯黄色头像与 AI 标识、用户开关、隐藏和反馈均已接入。文字 Post 与个人 Observation 分离，分享不上传照片、模拟置信度或精确定位。
- 当前 63 项自动化通过。已在本机用 DeepSeek 生成真实调试样本并验证来源引用/有限跟帖；人工语气评分、完整微信界面/预览包/真机验收仍待完成。Mock 不代表正式语气。

## 文档

- [一页体验步骤](docs/ai-community-experience.md)
- [完整本地运行与架构说明](docs/ai-community-local.md)
- [真实模型配置指南](docs/ai-community-model-setup.md)
- [测试报告](docs/ai-community-acceptance.md)
- [原任务书覆盖审计与未完成项](docs/ai-community-prompt-audit.md)
- [后续 PR 说明草稿](docs/ai-community-pr-draft.md)

## 文件与发布边界

模型密钥、地图本机配置、SQLite 数据、日志和真实评测原始输出均不随 Git 上传；每台设备需自行配置。`server`、`docs` 等通过 packOptions 从小程序包排除，实际预览包仍需在微信工具中检查。

这是本地开发功能分支，尚未接入生产登录、共享图片存储、HTTPS 或线上服务；动物识别仍为模拟结果。推送代码不代表合并 main、部署公网或发布微信小程序。
