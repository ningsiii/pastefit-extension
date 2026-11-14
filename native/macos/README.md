# Pages 可编辑公式辅助程序（Mac，可选）

普通文字、Word 和 WPS 路径无需安装。仅在 Mac Pages 需要可编辑公式时使用；不是 Windows WPS 辅助程序。

## 安装

使用公开仓库 Releases 中的 `PasteFitBridge-mac-universal.pkg`。0.1.1发布候选对应组件0.3.1；发布资产未上架前，链接不可用，不能将源码更新当作已安装。

1. 在贴妥工具栏的“公式设置”中，关闭WPS公式兼容，进入Pages设置。
2. 下载安装包，在macOS安装器完成安装；系统要求密码或Touch ID时本人确认。
3. 在系统设置→隐私与安全→辅助功能（部分系统为“设备控制和数据访问”）中开启“贴妥辅助程序”。首次转换允许该程序控制Pages。
4. 回向导完成固定公式试用。看到“设置完成”后，照常智能复制，等到“已复制”再粘到Pages。

未公证测试组件可能被macOS阻止，需要本人在隐私与安全中检查提示。无需申请Apple开发者账号才能本地试用。开发版重新签名升级可能使旧辅助功能记录失效；仅移除贴妥这一项、重新添加 `/Applications/贴妥辅助程序.app`，不要更改其他应用或降低系统保护。

程序只操作自己的临时文稿，不改用户目标文稿，不安装后台服务。系统级连接在 `/Library/Google/Chrome/NativeMessagingHosts/com.pastefit.pages_bridge.json`，仅接受安装包列出的扩展ID。向导可停用Chrome连接；如需卸载，另行移除该应用和它自己的连接记录，系统权限也可在设置移除。详见根目录隐私说明。

## 兼容范围

本机Mac Pages 15.3验证了常见分式、矩阵、上下标、合并表及表内公式；公式能编辑并保存重开。前三层原生标题已验证；四至六级可以手动调整。并非全部LaTeX/MathML语法、Pages版本或文稿模板均支持，Intel虽构建通用包但未实机测试。

0.3.1修复仅表内公式的成功判断：缺少外层公式标记时，从自己的临时Pages文稿导出Word并确认原生公式数量完整；不会把图片或文字降级报告为成功。内部导出有文件/输出/超时限额，正常结束清理；强制终止可能留下临时文件。使用macOS自带unzip读取固定XML条目，不访问网络。

## 从源码构建

需要macOS、Xcode Command Line Tools与Python3。根目录运行：

```sh
PASTEFIT_EXTENSION_IDS=idenmkpalcogianaoihjhhfoedefefcl native/macos/package-installer.sh
```

输出在 `release/task35/`；正式商店安装包只允许正式商店ID。自载开发版必须使用其实际扩展ID重新构建，不要给任意扩展添加权限。

本地联调可运行 `npm run build:mac-test`，这会生成含本机安装包的测试扩展ZIP，**不能上传Chrome商店**。它使用独立测试扩展ID，可能需重新授予该测试组件权限。普通 `npm run build` 不带二进制；需要安装入口时，通过 `PASTEFIT_MAC_INSTALLER_URL` 指向自己已发布且可访问的HTTPS安装资产。
