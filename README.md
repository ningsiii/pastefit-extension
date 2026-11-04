# 贴妥 PasteFit

<img src="public/icons/icon128.png" alt="PasteFit" width="96" height="96">

**Fit to paste.** 把 Markdown 和网页选区复制成适合文档或聊天的格式。

## 功能

- 选中文字，右键“贴妥智能复制”：同时提供文档富文本和聊天纯文本，由目标应用选择。
- “仅复制聊天文字”：去掉 Markdown 排版符号，把简单表格展开为字段文字。
- “贴妥编辑”：保留基本格式，修改文字，插入符号、序号与 Emoji，再复制。
- 可选选区浮条：逐网站授权、默认关闭。通过工具栏图标开启当前网站；在独立管理页添加、搜索、停用和删除网站。
- 全部转换在本地执行，无 AI 调用、账户、服务器、遥测或内容上传。

## 安装

从本仓库 Releases 下载 `pastefit-0.1.0.zip` 并解压。Chrome 打开 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，选择直接包含 `manifest.json` 的文件夹。

选中文字后可直接使用右键菜单。选区浮条需要主动开启并同意该网站授权，然后刷新网页。Chrome 内部页面等受限页面无法使用。

Chrome Web Store 链接将在审核通过后补充；此仓库公开不代表商店已经上架。

## 从源码构建

需要 Node.js 20+。在项目目录执行：

```sh
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

构建输出为 `dist/`，Chrome 可直接加载该目录。Windows 上运行 `npm run package` 生成 `release/pastefit-0.1.0.zip`。

`npm run dev` 监听源码并重新构建；更改后仍需在 Chrome 重新加载扩展并刷新网页。

## 格式与适用范围

支持标题、段落、强调、列表、引用、链接、代码和简单表格。文档富文本由目标编辑器解释；聊天软件通常使用纯文本。复杂合并单元格、公式和图片不保证原样呈现，图片以可用说明与链接降级。

不是手机 App 或 iPhone 快捷指令。手机实验不包含在本开源项目中。

## 隐私与许可

只在本机保存网站域名与开关，不保存正文或剪贴板历史。不开启浮条也可以手动右键复制。详情见 [隐私声明](PRIVACY.md)。

MIT License，见 [LICENSE](LICENSE)。Markdown 解析使用 Marked，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 反馈

请通过本仓库 Issues 提交问题，提供浏览器/目标软件版本和可公开的最小示例。不要提交真实聊天、密钥或个人资料。
