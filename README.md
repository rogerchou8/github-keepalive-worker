````md
# github-keepalive-worker

一个基于 **Cloudflare Workers** 的 GitHub 仓库保活（Keep Alive）与自愈更新工具。

当外部系统检测到项目不可达或异常时，可通过调用本 Worker 的接口，**自动更新 GitHub 仓库文件（如 README）**，以触发仓库活跃度刷新，并具备 **幂等控制与安全鉴权**，避免重复更新。

---

## ✨ 核心特性

- 🚀 **HTTP 接口触发**（非定时任务）
- 🔐 **Token 鉴权**，防止未授权调用
- 🧱 **KV 幂等控制**：3 小时内只执行一次更新
- 📝 **自动更新 GitHub 文件内容**
- 🌏 **支持中文与 Emoji（UTF-8 安全）**
- 📊 **完整日志输出，便于排障**
- ☁️ **完全运行于 Cloudflare Workers，无服务器依赖**

---

## 🧩 典型使用场景

- 项目部署在免费平台（如 Cloudflare Pages、Railway、Render 等），需要定期“保活”
- 上游 Worker / 监控系统在检测失败后，触发一次 GitHub 更新
- 不希望使用 GitHub Actions 定时任务
- 希望通过外部信号驱动 GitHub 仓库的自愈行为

---

## 🏗️ 工作原理

1. 客户端向 `/deploy` 发送 `POST` 请求
2. Worker 校验 `X-Deploy-Token`
3. 检查 KV 中是否存在 `flag=deployed`
   - 若存在（3 小时内已执行），直接跳过
4. 通过 GitHub API 读取目标文件
5. 更新 README 中的「最后更新时间」区块
6. 提交修改到 GitHub 仓库
7. 写入 `flag=deployed`，TTL 为 3 小时

---

## 🔌 API 接口说明

### `POST /deploy`

#### 请求头（必须）

```http
X-Deploy-Token: <DEPLOY_TOKEN>
````

#### 请求体

内容可为空，当前实现不依赖 body 参数。

#### 成功响应

```json
{
  "ok": true,
  "result": {
    "deployed": true
  }
}
```

#### 被幂等跳过

```json
{
  "ok": true,
  "result": {
    "skipped": true,
    "reason": "already deployed (within 3 hours)"
  }
}
```

#### 未授权

```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

---

## 🔐 环境变量配置

在 Cloudflare Workers 中配置以下环境变量：

| 变量名           | 必填 | 说明                                           |
| ---------------- | ---- | ---------------------------------------------- |
| `DEPLOY_TOKEN` | ✅   | 接口鉴权 Token                                 |
| `GITHUB_TOKEN` | ✅   | GitHub Access Token（需 contents: write 权限） |
| `GH_OWNER`     | ✅   | GitHub 用户名或组织名                          |
| `GH_REPO`      | ✅   | 仓库名称                                       |
| `GH_FILE_PATH` | ✅   | 要更新的文件路径（如 `README.md`）           |
| `GH_BRANCH`    | ❌   | 分支名（默认仓库主分支）                       |

### KV 命名空间

| 类型         | 绑定名       |
| ------------ | ------------ |
| KV Namespace | `STATE_KV` |

用于存储幂等标记 `flag=deployed`。

---

## 📝 README 更新时间戳格式

Worker 会在 README 中维护如下区块：

```md
## 🕒 最后更新时间

**UTC**: `2025-01-01 12:00:00`  
**北京时间**: `2025-01-01 20:00:00`  

> ⚡ 此时间戳由 Cloudflare Workers 自动更新
```

* 若区块已存在：更新内容
* 若不存在：追加到文件末尾

---

## 🧠 幂等与安全说明

* 同一仓库**3 小时内最多执行一次更新**
* 避免并发或重复触发导致 GitHub 提交风暴
* UTF-8 安全 Base64 编码，支持中文与 Emoji
* GitHub API 失败会直接中断并返回错误

---

## 📦 权限要求（GitHub Token）

GitHub Token 至少需要：

* `contents: write`

如果使用 Fine-grained Token：

* Repository access：选择目标仓库
* Permissions → Contents：Read & Write

---

## 📄 License

MIT License

---

## 🧭 备注

该项目设计为 **基础设施组件**，推荐与：

* 可达性检测 Worker
* 健康检查脚本
* 监控告警系统

组合使用，以实现完整的“检测 → 修复 → 保活”链路。
