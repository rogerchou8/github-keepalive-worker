export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // 仅允许 POST /deploy
    if (url.pathname === "/deploy" && req.method === "POST") {

      console.log("➡️ /deploy called");

      // ===== Token 鉴权 =====
      const tokenFromHeader = req.headers.get("X-Deploy-Token");
      if (!tokenFromHeader || tokenFromHeader !== env.DEPLOY_TOKEN) {
        console.warn("❌ Unauthorized request");
        return json(
          { ok: false, error: "Unauthorized" },
          401
        );
      }

      try {
        const result = await run(env);
        console.log("✅ deploy finished", result);
        return json({ ok: true, result });
      } catch (err) {
        console.error("🚨 deploy error", err);
        return json(
          { ok: false, error: err.message },
          500
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};

// ================= 常量 =================

const FLAG_KEY = "flag";
const FLAG_TTL = 3 * 60 * 60; // 3 小时（秒）

// ================= 核心流程 =================

async function run(env) {
  const {
    GITHUB_TOKEN,
    GH_OWNER,
    GH_REPO,
    GH_BRANCH,
    GH_FILE_PATH
  } = env;

  console.log("🔧 env check", {
    owner: GH_OWNER,
    repo: GH_REPO,
    branch: GH_BRANCH,
    path: GH_FILE_PATH,
    hasToken: !!GITHUB_TOKEN,
    hasKV: !!env.STATE_KV
  });

  if (!GITHUB_TOKEN || !GH_OWNER || !GH_REPO || !GH_FILE_PATH) {
    throw new Error("必要的环境变量未配置");
  }

  // 幂等控制
  const flag = await env.STATE_KV.get(FLAG_KEY);
  console.log("🧱 KV flag =", flag);

  if (flag === "deployed") {
    return { skipped: true, reason: "already deployed (within 3 hours)" };
  }

  console.log("📥 reading file from GitHub");

  const file = await getFile(
    GITHUB_TOKEN,
    GH_OWNER,
    GH_REPO,
    GH_FILE_PATH,
    GH_BRANCH
  );

  const rawContent = atob(file.content.replace(/\n/g, ""));
  const newContent = updateTimestampSection(rawContent);

  if (newContent === rawContent) {
    console.log("📄 content unchanged");
    return { skipped: true, reason: "content unchanged" };
  }

  console.log("📤 updating file on GitHub");

  await updateFile(
    GITHUB_TOKEN,
    GH_OWNER,
    GH_REPO,
    GH_FILE_PATH,
    GH_BRANCH,
    file.sha,
    newContent
  );

  // 写入 flag
  await env.STATE_KV.put(FLAG_KEY, "deployed", {
    expirationTtl: FLAG_TTL
  });

  console.log("🟢 deployed flag set (3h)");

  return { deployed: true };
}

// ================= GitHub API =================

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "cloudflare-worker"
  };
}

async function getFile(token, owner, repo, path, branch) {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}` +
    (branch ? `?ref=${branch}` : "");

  console.log("➡️ GET", url);

  const res = await fetch(url, {
    headers: ghHeaders(token)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ getFile failed", res.status, text);
    throw new Error(`读取文件失败: ${res.status}`);
  }

  return res.json();
}

async function updateFile(
  token,
  owner,
  repo,
  path,
  branch,
  sha,
  content
) {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const body = {
    message: "chore: auto update README timestamp",
    content: base64EncodeUnicode(content),
    sha,
    branch,
    committer: {
      name: "cloudflare-worker[bot]",
      email: "cloudflare-worker@users.noreply.github.com"
    }
  };

  console.log("➡️ PUT", url);

  const res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders(token),
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ updateFile failed", res.status, text);
    throw new Error(`提交失败: ${res.status}`);
  }
}

// ================= README 时间戳逻辑 =================

function updateTimestampSection(content) {
  const utc = new Date();
  const bj = new Date(
    utc.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );

  const fmt = d =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const section =
`\n## 🕒 最后更新时间

**UTC**: \`${fmt(utc)}\`  
**北京时间**: \`${fmt(bj)}\`  

> ⚡ 此时间戳由 Cloudflare Workers 自动更新
`;

  const reg = /## 🕒 最后更新时间[\s\S]*?(?=\n## |\n# |$)/;

  if (reg.test(content)) {
    return content.replace(reg, section.trim());
  }

  return content.trimEnd() + "\n" + section;
}

// ================= 工具函数 =================

function base64EncodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g,
      (_, p1) => String.fromCharCode("0x" + p1)
    )
  );
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
