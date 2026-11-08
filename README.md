# Deadline Hunter V2.5 路边队

把通知随手记下来，再决定今天做什么。

## 开始使用

本次为独立安装版：解压到新文件夹，双击 `config-api.cmd` 为本版本填写 `.env`，保存后双击 `start.bat`。默认地址为 `http://127.0.0.1:8795/`，与旧版8790分开运行。详见根目录唯一安装说明 `开始使用.txt`。

快捷添加支持一句话、通知文字、截图选择、拖拽和粘贴；识别预览后保存，缺时间也能记录。没有AI密钥时仍能手工保存和管理任务。

普通任务点击“今天做”；报告、复习和项目按需拆分。首页显示实际今天安排、临近截止、待提交和7天估计负载。图形分析与18周历史热力图直接可见。

## 说明文件

- `docs/V2.5-开始使用.md`：操作、Windows升级、日期依据与部署。
- `docs/产品设计说明.html`：用浏览器打开的参赛设计说明。
- `docs/V2.5-参赛作品设计说明.md`：可编辑文字，成员信息待据实填写。
- `docs/V2.5-更新与测试.md`：本轮验证及功能边界。
- `docs/GitHub与Render部署.md`：已有云端部署流程。

## 运行与测试

Node.js 20或更新版本。`npm start` 启动服务；`npm test` 运行程序测试。可选系统推送需要安装依赖 `npm install --omit=dev` 并单独配置。

浏览器测试见 `tests/inbox-browser.cjs` 和 `tests/inbox-resilience.cjs`，通过 `PLAYWRIGHT_MODULE` 指向本机Playwright，通过 `TEST_BASE_URL` 指定测试地址。测试使用隔离浏览器数据，不影响日常任务。

任务主要保存在浏览器中，没有账号同步。AI结果、年份建议和估时须核对；后台提醒取决于实际配置。密钥仅留在服务端，发行ZIP不含 `.env`。


网站演示视频：启动后在首页点“网站演示”，约2分13秒，含自然配音与字幕。
独立视频在public/media/deadline-hunter-demo.mp4。完整说明见docs/网站演示视频说明.md。

## 本地开发与规范提交

1. 安装 Node.js 20 或 22，克隆仓库并进入项目目录；执行 `npm install`。
2. 复制 `.env.example` 为 `.env`，按需填写自己的 DeepSeek API 密钥；**不要提交 `.env` 或任何真实密钥**。无密钥也可使用本地任务功能。
3. 运行 `npm start`，默认打开 `http://127.0.0.1:8795/`；在 Render 中由平台设置 `PORT`，监听 `0.0.0.0`。
4. 修改后先执行 `npm test`（Node 内置测试运行器），确认通过，再提交。可用 `git status` 和 `git diff --check` 检查变更。
5. 推荐新建分支提交：`git checkout -b fix/your-change`，`git add <修改文件>`，`git commit -m "fix: 简述修改"`，然后推送并发起 Pull Request。建议提交类型为 `fix:`、`feat:`、`docs:`、`test:` 或 `chore:`，保持单次提交聚焦；合并前等待 Node 20/22 CI 通过。

> 安全提示：Render 环境变量应在 Render 后台配置。`.gitignore` 不能撤销已提交过的密钥；若发现泄露，请立即撤销并轮换密钥，再处理 Git 历史。

## 版本文档入口

- 当前使用指南：`docs/V2.5-开始使用.md`。
- 历史版本与合并说明：`docs/版本说明索引.md`；保留旧版本原始文档作为历史记录。
