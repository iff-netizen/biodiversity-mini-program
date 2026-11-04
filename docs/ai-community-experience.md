# 一页本地体验

本机当前已切换 **真实 DeepSeek 模型**，无需重复配置；自然感与可爱程度仍待你体验评分。旧 Mock 评论继续带演示标记。

Mock 现在只响应有限的功能测试场景，未知内容会跳过；它不执行人格提示词。请按 [真实模型配置指南](ai-community-model-setup.md) 配好后再评价自由聊天。完整覆盖情况见 [Prompt 审计](ai-community-prompt-audit.md)。旧版通用日记口号已撤回，不会给旧帖补抽签。

1. 在 PowerShell 启动服务（如果已运行则跳过）：

   ```powershell
   Set-Location 'D:\大三\创\biodiversity-mini-program\server'
   node --env-file-if-exists=.env src/index.js
   ```

2. 微信开发者工具导入 `D:\大三\创\biodiversity-mini-program`；本地开发请求地址为 `http://127.0.0.1:8787`。按工具当前版本配置本地 HTTP 调试，扫码登录由你完成。工具里打开“发现”。本次尚未实测微信编译和布局。

3. 新 PowerShell 执行 `node scripts/demo.js`（同一 `server` 目录）。只创建 `demo:ai-v1` 测试动态：A“早上鸟叫像在点名”→B“校园晨间广播”。这两条为开发强制命中，页面保留 Mock 标记，正常发帖仍按概率决定。“我的 → 刷新决策与来源”可以看到 B 引用了 A 的实际版本来源。

4. 在“我的 → 切换 A/B/C”换到 B，回发现查看 B 的帖子。在 AI 评论下点“回复”，填写想说的话；正常策略有 60% 候选概率，最多再接一轮。若需要确定性地看有限回复，运行 `node scripts/demo.js --reply`，只对上述测试数据强制接一轮。

5. 切到 C 自由发几条不同内容：第一次观察、没拍到、心情失落、未知物种、投喂想法等。合格新帖评论概率为 80%（`policy-2`），正常命中延迟 8—45 秒，且有 15 分钟初始冷却，所以连续帖子仍会因冷却跳过；@ 不保证回复。旧帖不重新抽签。诊断中可区分 `random_miss`、`cooldown`、配额和内容原因。可用“推进 60 秒并执行任务”缩短开发等待；不用反复刷新碰运气。

6. 在 A 的帖子菜单撤回记忆许可、转私密、编辑或删除：依赖 A 的 B 旧 AI 引用会消失。此规则也适用于模型正在生成时。删除动态保留个人观察。“我的”关闭 AI 后待处理任务取消；重新打开不会给旧帖子重新抽签。

7. 体验隐藏/反馈 AI 评论、重复点赞/“我也见过”、断开服务后草稿重试。到“本机观察”查看旧记录；补充正文并主动分享才会公开。普通文字帖不会增加图鉴和观察统计。重启服务后再次查看，评论、偏好和合格记忆应保留。

8. 只清理本次演示：

   ```powershell
   Set-Location 'D:\大三\创\biodiversity-mini-program\server'
   node scripts/demo.js --clean
   node scripts/demo.js
   ```

   仅清除 `demo:ai-v1` 帖子及子数据与其测试配额占用，不清空原观察、非测试帖子或整库。清理后建议 `Ctrl+C` 重启服务，手动测试时钟偏移恢复为 0。带 `--scenarios` 可额外创建 12 类测试动态；它们仍受正常概率和配额约束，不保证都有评论。

真实模型体验：在本机 `server/.env` 填写 `AI_PROVIDER=real`、`AI_MODEL`、`AI_API_KEY` 后重启。详情见 `ai-community-local.md`。不要将密钥发到聊天；没有真实模型输出前，不把 Mock 的语气评价当作验收结论。
