# Knowledge 侧车（OneEarning）

本地 HTTP 服务：提取管道（Phase 1：`text`、`pdf` 文本层）+ SQLite FTS5 全文检索。

## 环境变量

- `PORT`（必填）：监听 `127.0.0.1:PORT`
- `ONEEARNING_KB_ROOT`（必填）：知识库根目录，形如 `<userData>/oneearning/knowledge`

## HTTP

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/reindex` | 扫描目录增量索引 |
| POST | `/index-file` | 单文件刷新 |
| POST | `/reextract` | 强制重提取 |
| DELETE | `/file` | 仅从索引移除（POST `/remove-file` 同义） |
| POST | `/search` | 全文检索 |
| GET | `/info` | 汇总统计 |
| GET | `/status` | 每文件状态 |

索引数据库：`<ONEEARNING_KB_ROOT>/.index/<companyId>/<agentId>.sqlite`。

## Phase 2

音视频 ASR、OCR、`jobs` 队列异步提取（占位接口已预留）。
