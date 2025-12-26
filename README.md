# GitHub KeepAlive Worker

一个基于 **Cloudflare Workers** 的轻量级保活服务，用于 **通过 API 自动修改 GitHub 仓库文件内容**，从而触发仓库活动，避免关联项目因长期无提交而进入休眠状态。

该项目支持 **安全鉴权、幂等控制、UTF-8 内容处理、GitHub Contents API**，适合部署为长期稳定运行的自动化组件。

---

## ✨ 功能特性

* 🔐 **Token 鉴权接口**
  通过固定 Token 控制部署接口访问，避免未授权调用

* 🧱 **幂等保护（KV）**
  使用 Cloudflare KV 记录部署状态，3 小时内仅允许一次生效修改

* 📝 **GitHub 文件自动更新**
  基于 GitHub Contents API 读取并更新指定文件（如 README）

* 🌍 **UTF-8 安全 Base64 编解码**
  完整支持中文内容，避免 GitHub API 常见编码错误

* ⚙️ **完全环境变量驱动**
  无硬编码仓库信息，便于复用与迁移

* 🚀 **零定时器依赖**
  通过 HTTP API 主动触发，适合与监控/重试机制联动

---

## 🧩 适用场景

* GitHub 仓库需要 **定期产生提交活动**
* 免费平台 / Serverless 项目 **防止因长期无提交被休眠**
* 将 GitHub 更新动作作为 **下游依赖的触发信号**
* 构建 **轻量级 DevOps 自动化节点**

---

## 🏗️ 架构说明

```text
┌────────────┐
│  外部系统  │
│ (监控/重试)│
└─────┬──────┘
      │ POST /deploy
      ▼
┌────────────────────┐
│ Cloudflare Worker  │
│  - Token 校验      │
│  - KV 幂等判断     │
│  - GitHub API 调用 │
└─────┬──────────────┘
      │
      ▼
┌────────────────────┐
│ GitHub Repository  │
│  - 更新目标文件    │
│  - 产生提交记录    │
└────────────────────┘
```

---

## 📦 部署方式

### 1️⃣ 创建 Cloudflare Worker

* 新建 Worker（Module 模式）
* 将 `worker.js` 内容完整粘贴并保存

---

### 2️⃣ 绑定 KV Namespace

创建一个 KV Namespace，并绑定为：

```text
STATE_KV
```

用于记录部署标记（3 小时自动过期）。

---

### 3️⃣ 配置环境变量

| 变量名                  | 必填 | 说明                                                  |
| -------------------- | -- | --------------------------------------------------- |
| `DEPLOY_TOKEN`       | ✅  | 调用接口所需的固定鉴权 Token                                   |
| `GITHUB_TOKEN`       | ✅  | GitHub Personal Access Token（需 `contents:write` 权限） |
| `GH_CONTENT_API_URL` | ✅  | GitHub Contents API 完整地址                            |
| `GH_BRANCH`          | ❌  | 目标分支名（默认仓库主分支）                                      |

#### 示例

```text
DEPLOY_TOKEN=your-random-secret-token
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GH_CONTENT_API_URL=https://api.github.com/repos/yourname/yourrepo/contents/README.md
GH_BRANCH=main
```

---

## 🔐 GitHub Token 权限要求

创建 GitHub PAT 时，至少勾选：

* ✅ `Contents: Read and write`

无需其他权限。

---

## 🔌 API 使用说明

### 调用接口

```http
POST /deploy
```

### 请求头

```http
X-Deploy-Token: <DEPLOY_TOKEN>
```

### 成功响应

```json
{
  "ok": true,
  "result": {
    "deployed": true
  }
}
```

### 幂等跳过响应

```json
{
  "ok": true,
  "result": {
    "skipped": true,
    "reason": "already deployed (within 3 hours)"
  }
}
```

### 未授权

```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

---

## 🕒 文件更新逻辑说明

Worker 会在目标文件中：

* 自动插入或更新 `最后更新时间` 区块
* 同时记录 **UTC 时间** 与 **北京时间**
* 若内容无变化，则不会提交新 commit

该设计确保：

* 提交行为最小化
* 不引入无意义 diff

---

## 🛡️ 可靠性与安全性

* 不暴露 GitHub Token
* 接口具备鉴权与幂等限制
* 所有异常均记录日志，便于 Worker Dashboard 排查
* 不依赖定时任务，避免误触发

---

## 📄 License

MIT License

---

## 📌 备注

本项目设计为 **基础设施型组件**，建议作为：

* 私有工具仓库
* 或被其他自动化系统调用的下游服务

如需扩展为多文件、多仓库或批量更新模式，可在当前架构上直接演进。

---
