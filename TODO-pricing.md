# 任务：公开定价总览

- 目标：`/pricing` 默认展示简洁报价总览，可切换原有模型广场；共用价格接口、计费工具和模型详情。沿用暖白/炭黑/橙色主题。
- 边界：不改实际计费或后端接口。公开默认分组、登录用户分组明确标注，不冒用最低分组价。官方参考价仅采用核实来源，缺失不编造。
- [x] T1：完成双视图、报价表、厂商筛选、模型详情、CTA 和计费说明。
- [x] T2：补齐七语言和回归（默认/切换、分组倍率、零缓存价、动态/按次价、错误空态）。
- [x] T3：typecheck、lint、build 和相关测试；检查本地预览，记录真实验收限制。

完成：总览报价复用 `formatGroupPrice`、`getDynamicPricingTiers`、`getDynamicPriceEntries`，保留范围和缺失值。表格扩展 columns prop，沿用分页、滚动和详情抽屉。官方参考只维护已核实 Claude 精确 ID；来源页面于 2026-09-17 读取。尚未发布镜像。
- `bun run test -- src/features/pricing/__tests__/overview.test.tsx`：5 PASS。覆盖真实路由切换、厂商筛选、详情打开/关闭、CTA、登录后分组价格刷新、请求失败/重试、空态；纯报价回归包含明确零缓存价、阶梯范围、条件倍率、按次计费及未知型号参考价。仅隔离网络与外部 canvas 图表渲染，不 mock 被测页面。
- `bun run test -- src/features/pricing/__tests__/model-cards.test.tsx src/features/pricing/__tests__/pricing-controls.test.tsx src/features/pricing/__tests__/dynamic-price.test.ts src/features/usage-logs/components/__tests__/detail-preview.test.tsx src/features/usage-logs/components/__tests__/usage-facts.test.tsx`：87 PASS。
- `bun run typecheck`、改动 TS/TSX 文件 oxlint / oxfmt、`bun run build`、`git diff --check` 均通过。新增 21 个定价文案及占位符在七语言验证齐全，已运行 `bun run i18n:sync`。
- 本地 :5173 和 /api/pricing 正常；预览库当前 0 个启用模型，展示空态。浏览器控制报 unsupported Codex auth method: apikey，尚未做截图验收。
- 长期约定已更新 `web/AGENTS.md` 的公开定价说明。
