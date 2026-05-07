# Clawhub API（本仓库验证摘要）

- 列表：`GET https://clawhub.ai/api/v1/skills?limit=2&sort=createdAt`
- 元数据：`GET https://clawhub.ai/api/v1/skills/{slug}`
- 下载 zip（与 `clawhub` npm 包一致）：`GET https://clawhub.ai/api/v1/download?slug={slug}&version={semver}`
- 参考实现：`clawhub` 包中 `ApiRoutes.download` + `downloadZip`（`GET` + `slug` / `version` 查询参数）。
