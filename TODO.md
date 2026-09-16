# 任务：支持工单

## 目标与边界
- 按用户截图增加支持工单：用户新建、主题搜索、状态/分类/优先级筛选、分页、详情回复、解决/重新打开；管理员查看处理全部工单。
- 复用现有表格、弹窗、权限和多语言；不新增外部消息、附件或自动分配系统。
- 保留本会话已有首页与全局主题改动。用户已授权本地启动和功能实现，未授权提交或线上发布。

## 验收条件
- A1：普通用户只能读写自己的工单，管理员可处理全部；限制字段和正文长度，持久化回复与状态。
- A2：侧栏和页面可用，七语言齐全，窄屏、空态、错误、重复提交行为有验证。
- A3：真实 SQLite/MySQL/PostgreSQL 验证新建和迁移幂等，覆盖最新发布版升级数据保留；前后端测试/类型/lint/build 通过，重启本地服务展示。

## 执行清单
- [x] T1（完成；A1）：模型、迁移、接口、权限和回归测试。TestSupportTicketWorkflow 三库通过，真实 HTTP 鉴权探测通过。
- [x] T2（完成；依赖 T1；A2）：列表、新建、详情回复、管理入口和七语言已完成；5 项交互测试（含移动布局、失败草稿、重复提交）、13 项侧栏测试通过。
- [x] T3（完成；依赖 T1/T2；A3）：六组数据库验证、3 项错误展示测试、typecheck/lint/format、Go 和前端 build 通过；新后端启动迁移成功，:5173 页面和接口代理已确认。

## 恢复点
- 新增工单模块已在本地运行：前端 127.0.0.1:5173、后端 :3000，数据 .local-tests/preview/preview.db（保留用户初始化）。只使用独立测试容器，均已停止，不改其他运行服务。
- 两表 SupportTicket / SupportTicketMessage；状态 open/resolved，分类 general/billing/technical/account，优先级 low/normal/high/urgent。普通用户拥有者隔离、管理员路由使用现有 AdminAuth。
- 后端两文件 model/support_ticket.go、controller/support_ticket.go，测试 controller/support_ticket_test.go；路由 /api/tickets 与 /api/ticket-management。前端 web/src/features/tickets 与两个 _authenticated 路由。
- 六组数据库验证日志 .local-tests/tickets/{pg,mysql,sqlite}-{fresh,upgrade}.log 均 PASS；测试二进制 controller-tests.exe，PowerShell 参数需引号 '-test.run=^TestSupportTicketWorkflow$' '-test.v'。SQLite 3.50.4、MySQL 8.0.46、PostgreSQL 17.10。
- 升级库由 calciumion/new-api:v1.0.0-rc.37 容器创建并初始化代表用户。旧版本容器 new-api-ticket-old-{pg,mysql,sqlite} 和数据库容器 new-api-ticket-{pg,mysql} 均已停止，后两者需要复验时可启动（端口 55442/55443）。测试使用专门库 tickets / tickets_upgrade，旧版 SQLite .local-tests/tickets/released.db。
- SectionPageLayout 只渲染 Slot 子节点：工单 dialogs 放在布局组件外的 Fragment 内。复用 DataTablePage/useDataTable、Dialog、NativeSelect、ErrorState、LoadingState 和表单组件，未另建通用 UI 封装。
- 最终矩阵：SQLite 3.50.4 / MySQL 8.0.46 / PostgreSQL 17.10，fresh 与 released upgrade 各一组，共六组 PASS。每组启动迁移两次，验证既有用户配额、用户名唯一约束、工单内容/回复及工单索引保留，另含真实 UserAuth/AdminAuth 的 401/403/200 检查。工单仅用主库，不经过独立日志库。
- 重现：`go test -c ./controller -o .local-tests/tickets/controller-tests.exe`，按数据库设 `TICKET_TEST_DSN`（PG :55442 或 MySQL :55443 的 tickets/tickets_upgrade）或 `TICKET_TEST_SQLITE`，升级库设 `TICKET_REQUIRE_UPGRADE=1`；运行 `& '.local-tests/tickets/controller-tests.exe' '-test.run=^TestSupportTicketWorkflow$' '-test.v'`。默认不设变量时用临时 SQLite。
- 前端命令：`bun run test -- src/features/tickets/__tests__/workflow.test.tsx src/hooks/__tests__/sidebar-config.test.tsx`（18 PASS）；`bun run test -- src/lib/server-error-message.test.ts`（3 PASS）；`bun run typecheck`、针对改动文件 oxlint/oxfmt、`bun run build` 均 PASS。后端 `go build -o .local-tests/tickets/new-api.exe .` PASS。
- 独立 :3002 服务 HTTP 流程已通过：创建、管理列表、员工回复、解决、409 拒绝继续回复、重开及匿名 401。测试服务已停止。预览数据库在停止旧进程后备份到 .local-tests/preview/before-tickets，随后用新二进制启动 :3000。
- 验收完成：status 和 setup 正常；带浏览器 Accept:text/html 的 /tickets、/ticket-management 返回 200，匿名 API 返回 401。现有账号数据保留，新后端 PID 47636。浏览器自动化不可用，未进行像素级视觉验收。
