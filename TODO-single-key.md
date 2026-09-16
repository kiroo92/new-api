# 单用户模型 API Key

用户要求：注册后自带且仅保留一个模型 API Key，可重新生成，不设置 Key 级模型限制。个人访问令牌、登录会话和管理员分组权限不变。

- [x] T1：统一注册事务、旧账号迁移、阻断额外创建/删除和限制编辑；轮换锁定用户，缓存不能继续授权旧密钥。
- [x] T2：重新生成使用一次性安全证明、非敏感审计；前端确认/验证/轮换/重新复制闭环及七语言（131 项相关前端测试通过）。
- [x] T3：可重复三数据库新建/升级测试、注册失败回滚、并发、Redis 旧缓存、证明过期/重放；构建并更新本地预览。

已修正前次缺口：移除 HasTable 静默跳过；用户行锁覆盖创建/轮换；迁移旧用户；Redis 凭据读取核验数据库；前端清理已解析 Key 并丢弃迟到响应；轮换审计与一次性证明接入。

迁移保留最早未删除 token 的 ID/Key/用量，软删除其他 token（历史日志不删）。已禁用 Key 保持禁用，重新生成明确启用新凭据。不处理分销。

## 验证记录
- 三数据库：SQLite 3.50.4、MySQL 8.0.46、PostgreSQL 17.10，Redis 8.4；新建/发布版 v1.0.0-rc.37 升级共六组通过。每组执行两次 InitDB，验证发布版用户余额、Key/用量保留、多余 Key 撤销、重复迁移、并发建 Key、注册事务失败回滚和旧 Redis 缓存拒绝。
- 命令：`go test -c ./model -o .local-tests/single-key/model-tests.exe`；设置专用 `DEFAULT_TOKEN_TEST_DSN` 或 `DEFAULT_TOKEN_TEST_SQLITE`、`DEFAULT_TOKEN_TEST_REDIS=127.0.0.1:55447`，执行 `& '.local-tests/single-key/model-tests.exe' '-test.run=^TestUserDefaultAPIKeyLifecycle$' '-test.v'`。升级库还设 `DEFAULT_TOKEN_REQUIRE_UPGRADE=1`。日志 `.local-tests/single-key/*-final.log`。
- `go test ./model -count=1` 和 `go test ./controller -count=1` 全包通过。修正相关测试夹具未关闭 SQLite 连接的清理问题。`TestAccountAPIKeyRotationSecurity` 覆盖缺少/错误范围/过期/重放证明、禁止额外创建和删除、日志不含密钥。
- 前端 `bun run test -- src/features/keys src/features/auth/secure-verification/__tests__ src/features/usage-logs/audit/__tests__/details.test.tsx`：9 文件 131 项通过；typecheck、改动文件 oxlint/oxfmt 通过。
- 安全参考：OWASP ASVS 5.0.0（7.5.1 敏感操作重新验证、6.3.4 各认证路径控制一致）；Authentication / Session Management Cheat Sheets。保留 bearer 会话鉴权、单次过期安全证明、随机 Key、轮换撤销、无密钥审计。未宣称全应用 ASVS 合规。
- 启动顺序回归：主数据库迁移在 Redis 初始化之前运行，迁移必须处理 RedisEnabled=true/RDB=nil；增加专门夹具覆盖，最终六组矩阵复验全部通过。
- 完成：新后端运行在 :3000，前端 http://127.0.0.1:5173/keys；status/setup 正常、页面 HTTP200、匿名轮换 HTTP401。独立 HTTP 验证覆盖注册即生成一 Key、拒绝额外创建/删除、轮换后旧 Key 401/新 Key 200、安全证明重放403。预览数据库备份在 .local-tests/preview/before-single-key。
- 测试容器均已停止。浏览器插件不可用，未做浏览器截图验收。
