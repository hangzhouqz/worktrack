# 部署到 GitHub Pages 教程（永久链接，可分享）

> 目标：把工时统计 PWA 推到你自己的 GitHub 仓库，开启 Pages，拿到永久 HTTPS 链接，手机访问即可安装。

---

## ⚠️ 第 0 步：安全提醒（必读）

1. **你刚才在对话里发了 GitHub 密码——请立刻去改密码。** 对话记录可能被留存，密码泄露风险真实存在。
2. **GitHub 早就不再支持用账号密码推送代码**，必须用「个人访问令牌（PAT）」。所以你的密码我**不会使用、也无法用于推送**。下面教你怎么生成 PAT。
3. 我已在本地帮你把项目 `git init` + `commit` 好了，剩下的「创建仓库 / 生成令牌 / 推送 / 开 Pages」这几步必须你本人在网页和终端操作，因为涉及你的账号凭据。

---

## 第 1 步：在 GitHub 创建空仓库

1. 浏览器打开 https://github.com/new （用你的 Google 账号已登录的话直接进）
2. 填写：
   - **Repository name**：`worktrack`（全小写英文，别用中文）
   - **Description**：工时统计 PWA（可填可不填）
   - 选 **Public**（公开）——免费账户的 GitHub Pages 只支持公开仓库
3. **三个选项全部不要勾**：
   - ❌ Add a README file
   - ❌ Add .gitignore
   - ❌ Choose a license
   （勾了会跟本地已有文件冲突，推不上去）
4. 点底部绿色按钮 **Create repository**

创建后会跳到一个空仓库页面，上面有一串 `https://github.com/你的用户名/worktrack.git` 的地址，**记下你的 GitHub 用户名**（就是地址里 `github.com/` 后面那段）。

---

## 第 2 步：生成个人访问令牌（PAT）

1. 点右上角头像 → **Settings**
2. 左侧菜单最底下 **Developer settings**
3. **Personal access tokens** → **Tokens (classic)** → 点 **Generate new token (classic)**
4. 填写：
   - **Note**：`worktrack-push`（随便写，方便认）
   - **Expiration**：选 90 days 或 No expiration
   - **勾选权限**：只勾 **`repo`**（第一个大项，勾它就会自动勾下面所有子项）
5. 点底部绿色 **Generate token**
6. **立刻复制那串令牌**（`ghp_` 开头的一长串）——只显示这一次，关掉就再也看不到了，存到记事本备用

---

## 第 3 步：把代码推到 GitHub

在本机打开终端（就是我现在用的这个命令行），依次执行（**把 `<你的用户名>` 和 `<你的令牌>` 换成你自己的**）：

```bash
cd "D:\task_file\windows\工时统计系统"

# 关联远程仓库（替换用户名）
git remote add origin https://github.com/<你的用户名>/worktrack.git

# 推送（替换用户名和令牌）
git push -u https://<你的用户名>:<你的令牌>@github.com/<你的用户名>/worktrack.git main
```

> 说明：本地仓库我已经 `init` + `commit` 好了，所以直接 push 即可。上面第二条命令把令牌嵌在 URL 里，这样不会再弹窗要密码。

推送成功会看到类似 `* [new branch] main -> main` 的输出。

推送后可以删掉令牌痕迹（可选）：
```bash
git remote set-url origin https://github.com/<你的用户名>/worktrack.git
```

---

## 第 4 步：开启 GitHub Pages

1. 回到仓库网页 https://github.com/<你的用户名>/worktrack
2. 点顶部 **Settings** 标签
3. 左侧菜单找 **Pages**
4. **Source** 选 **Deploy from a branch**
5. **Branch** 下拉选 `main`，右边文件夹选 `/root`，点 **Save**
6. 等待 1～3 分钟，刷新该页面，顶部会出现绿色提示：
   ```
   Your site is live at https://<你的用户名>.github.io/worktrack/
   ```

这就是你的**永久 HTTPS 链接**，以后随便分享。

---

## 第 5 步：手机安装 + 分享

1. 手机浏览器（推荐 Chrome）打开：
   ```
   https://<你的用户名>.github.io/worktrack/
   ```
2. 菜单 → **添加到主屏幕** → 桌面生成图标
3. 点开即用，离线可用，数据存手机本地
4. 把这个链接发给朋友，朋友打开同样操作即可安装，**数据各管各的，互不影响**

---

## 常见问题

**Q：推送时报 `Authentication failed`？**
A：令牌填错了，或者没勾 `repo` 权限。重新生成令牌再试。

**Q：Pages 开了但访问 404？**
A：等几分钟（首次部署要时间）；确认仓库名和用户名拼写对；确认选的是 `main` 分支 `/root`。

**Q：以后想改代码怎么办？**
A：改完本地文件后，在终端执行：
```bash
cd "D:\task_file\windows\工时统计系统"
git add -A
git commit -m "说明改了啥"
git push
```
Pages 会自动重新部署，1～2 分钟后手机刷新就是新版。

**Q：推送时弹窗要用户名密码怎么办？**
A：用户名填你的 GitHub 用户名，密码填**令牌**（不是账号密码）。或者直接用上面第 3 步带令牌的 URL 一次推完。

---

## 本地仓库状态（我已帮你做好）

- 仓库已 `git init`，默认分支 `main`
- 已提交：`工时统计 PWA v2：localStorage 数据层 + 双分类统计 + 离线`
- `.gitignore` 已排除 `.workbuddy/`（IDE 内部目录）
- 提交的文件：index.html、styles.css、app.js、manifest.webmanifest、sw.js、icon.svg、icon-192.png、icon-512.png、make_icons.py、工作日志/

你只需执行上面第 3～5 步即可上线。
