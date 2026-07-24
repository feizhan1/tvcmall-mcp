# 积分流水方向筛选设计

## 目标

为 `tvcmall_list_point_records` 增加面向模型的积分流水方向筛选，并向 TVCMall WebApi `GET /v3/user/points/list` 发送必需的 `pointstype` query 参数。

## MCP 输入契约

新增可选字段 `direction`，仅接受以下小写值，未提供时默认 `all`：

| 用户意图 | MCP `direction` | WebApi `pointstype` |
| --- | --- | --- |
| 全部记录或未指定方向 | `all` | `0` |
| 获得、获取积分 | `got` | `1` |
| 使用、消耗积分 | `used` | `2` |

工具描述和 `direction` schema 描述必须包含这组映射，使模型能够依据用户问题选择正确参数。HTTP client 只向既有 WebApi route 添加 `pointstype`，不新增业务 route。

## 保持不变的契约

- 分页参数 `page`、`page_size` 及其默认值和上限保持不变。
- 积分流水输出结构、积分汇总工具、鉴权、PAT 透传、错误映射和 PII 脱敏保持不变。
- `direction` 是 MCP 语义字段，`pointstype` 只在 WebApi HTTP 请求中出现；不得将下游参数名直接暴露为模型首选输入。

## 实现边界

1. 在积分领域定义 `PointRecordsDirection`，让解析后的列表查询输入始终携带方向。
2. Zod schema 使用 `all`、`got`、`used` enum，并默认 `all`。
3. HTTP client 将方向固定映射为字符串 query 值 `0`、`1`、`2`。
4. Fake client 使用 fixture 的 `earn` 与 `use` 记录模拟 `got` 与 `used` 筛选，`all` 返回全部记录。
5. 更新工具描述、API 契约和测试；不改变输出记录的 `type` 字段。

## 测试与验收

- schema 接受三种方向，缺失值补齐为 `all`，拒绝非法值。
- HTTP client 针对三种方向分别发送 `pointstype=0`、`pointstype=1`、`pointstype=2`，且默认调用发送 `0`。
- Fake client 方向筛选与分页可重复验证。
- 工具描述与字段说明包含用户意图到方向和值的映射。
- 相关单元测试、完整测试、typecheck、build 和 `git diff --check` 通过。
