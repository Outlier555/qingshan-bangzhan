# 青山帮战报名

《逆水寒》手游青山帮会的报名网站。成员可以一键报名、查看自己的小队位置以及导出编队图。管理员负责审核成员、发布帮战和调整 30 格编队。

详细规则见 [需求说明](需求说明.md)。

## 本地运行

安装 Node.js 24，然后在本目录的 PowerShell 或终端运行：

```text
node qingshan-site/server.mjs
```

打开 `http://127.0.0.1:8787/`。若该端口已被其他实例占用，可以在 PowerShell 中先运行 `$env:PORT='8789'`，再启动并访问对应端口。

首次启动时，终端会显示初始化码。用它在网页设置 `admin` 密码和统一邀请码。管理员在「成员管理 → 导入名册」粘贴游戏 ID，每行一个。之后由「活动管理」创建帮战。数据保存在运行时生成的 `qingshan-site/data/qingshan.sqlite`。

## 代码结构

| 文件 | 用途 |
|---|---|
| `qingshan-site/index.html`、`style.css` | 网站入口和响应式界面 |
| `qingshan-site/app.js` | 注册、报名、编队和管理员交互 |
| `qingshan-site/roster-image.js` | 生成微信群名单 PNG |
| `qingshan-site/server.mjs` | HTTP 服务、账号、管理接口和 SQLite 存储 |
| `qingshan-site/rules.mjs` | 自动排位、治疗限制、团长位和候补补位 |
| `qingshan-site/character-cover.webp` | 青山原创职业群像 |
| `qingshan-preview/qingshan-landscape.png` | 山水素材 |

## Docker

从本目录构建：

```bash
docker build -t qingshan-site:local -f qingshan-site/Dockerfile .
docker run -d --name qingshan-site --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v qingshan-data:/app/qingshan-site/data \
  qingshan-site:local
```

如果服务器已有名为 `qingshan-site` 的容器，先确认是创建新实例还是升级旧实例。升级时需复用原来的数据库挂载。对外提供服务时，由 HTTPS 反向代理转发到应用端口，并设置 `QINGSHAN_HTTPS=1`、`QINGSHAN_ORIGIN` 为网站的实际 HTTPS 地址。
