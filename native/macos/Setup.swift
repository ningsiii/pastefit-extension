import AppKit
import ApplicationServices
import Foundation

let bridgeProtocol = 2
let bridgeVersion = "0.3.1"
let setupCommands: Set<String> = ["bridge-status", "bridge-request-accessibility", "bridge-request-automation", "bridge-self-test"]
let extensionIDs = (Bundle.main.object(forInfoDictionaryKey: "PasteFitAllowedExtensions") as? [String] ?? ["kghnclkimijdblhcpbbmpofjdclpghpn"]).filter { $0.range(of: "^[a-p]{32}$", options: .regularExpression) != nil }
let systemApp = URL(fileURLWithPath: "/Applications/贴妥辅助程序.app")
let installedApp = Bundle.main.bundleURL.standardizedFileURL == systemApp.standardizedFileURL ? systemApp : FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/贴妥辅助程序.app")

private func automation(_ prompt: Bool) -> String {
    let target = NSAppleEventDescriptor(bundleIdentifier: "com.apple.Pages")
    let code = AEDeterminePermissionToAutomateTarget(target.aeDesc, AEEventClass(typeWildCard), AEEventID(typeWildCard), prompt)
    switch code {
    case noErr: return "granted"
    case OSStatus(errAEEventNotPermitted): return "denied"
    case OSStatus(errAEEventWouldRequireUserConsent): return "required"
    case OSStatus(procNotFound): return "not-running"
    default: return "unavailable"
    }
}
func bridgeState() -> [String: Any] {
    ["protocol": bridgeProtocol, "version": bridgeVersion, "accessibility": AXIsProcessTrusted(),
     "automation": automation(false), "pagesInstalled": NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Pages") != nil]
}
func setupResponse(_ command: String, cancelled: () -> Bool = { false }) -> [String: Any] {
    guard setupCommands.contains(command) else { return ["ok": false, "code": "invalid-command"] }
    if command == "bridge-request-accessibility" {
        _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
    }
    if command == "bridge-request-automation" {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Pages") else { return ["ok": false, "code": "pages-unavailable"] }
        if NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Pages").isEmpty {
            let config = NSWorkspace.OpenConfiguration(); config.activates = false
            var complete = false
            NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in complete = true }
            let deadline = Date().addingTimeInterval(12)
            while !complete && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
        }
        let permission = automation(true)
        if permission == "denied" { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")!) }
    }
    if command == "bridge-self-test" {
        let state = bridgeState()
        guard state["accessibility"] as? Bool == true else { return ["ok": false, "code": "accessibility-permission", "state": state] }
        guard state["automation"] as? String == "granted" else { return ["ok": false, "code": "automation-permission", "state": state] }
        // Fixed synthetic content only. User document/clipboard is never read as input.
        let xml = "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\"><w:body><w:p><w:r><w:t>PasteFit setup: </w:t></w:r><m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></w:p></w:body></w:document>"
        let standard = StandardClipboard(html: "<p>PasteFit setup: <math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mfrac><mn>1</mn><mn>2</mn></mfrac></math></p>", plain: "PasteFit setup: \\(\\frac{1}{2}\\)")
        var result = convertLocally(xml, standard: standard, cancelled: cancelled)
        result["state"] = bridgeState(); result["tested"] = result["ok"] as? Bool == true
        return result
    }
    return ["ok": true, "state": bridgeState()]
}

// Per-user installer: no shell, admin helper, network, login item or daemon.
// This replaces only our own app and NativeMessaging registration.
func installForCurrentUser() throws {
    let fm = FileManager.default
    let directory = installedApp.deletingLastPathComponent()
    try fm.createDirectory(at: directory, withIntermediateDirectories: true)
    guard !directory.resolvingSymlinksInPath().path.hasPrefix("/var/root/"),
        directory.standardizedFileURL == directory.resolvingSymlinksInPath().standardizedFileURL else { throw BridgeFailure(code: "unsafe-install-location") }
    let source = Bundle.main.bundleURL
    if source.standardizedFileURL != installedApp.standardizedFileURL {
        if fm.fileExists(atPath: installedApp.path) {
            let attributes = try fm.attributesOfItem(atPath: installedApp.path)
            guard attributes[.type] as? FileAttributeType != .typeSymbolicLink,
                Bundle(url: installedApp)?.bundleIdentifier == "com.pastefit.PagesBridge" else { throw BridgeFailure(code: "install-conflict") }
        }
        let stage = directory.appendingPathComponent(".PasteFit-" + UUID().uuidString + ".app")
        defer { try? fm.removeItem(at: stage) }
        try fm.copyItem(at: source, to: stage)
        if fm.fileExists(atPath: installedApp.path) { _ = try fm.replaceItemAt(installedApp, withItemAt: stage) }
        else { try fm.moveItem(at: stage, to: installedApp) }
    }
    let hostDirectory = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts")
    try fm.createDirectory(at: hostDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    guard hostDirectory.standardizedFileURL == hostDirectory.resolvingSymlinksInPath().standardizedFileURL else { throw BridgeFailure(code: "unsafe-install-location") }
    let manifest = hostDirectory.appendingPathComponent("com.pastefit.pages_bridge.json")
    if fm.fileExists(atPath: manifest.path) {
        let attributes = try fm.attributesOfItem(atPath: manifest.path)
        guard attributes[.type] as? FileAttributeType != .typeSymbolicLink,
            let existing = try JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any],
            existing["name"] as? String == "com.pastefit.pages_bridge",
            let previousPath = existing["path"] as? String, previousPath.hasSuffix("/Contents/MacOS/PasteFitBridge") else { throw BridgeFailure(code: "install-conflict") }
    }
    let value: [String: Any] = ["name": "com.pastefit.pages_bridge", "description": "PasteFit local equation bridge", "type": "stdio", "path": installedApp.appendingPathComponent("Contents/MacOS/PasteFitBridge").path, "allowed_origins": extensionIDs.map { "chrome-extension://\($0)/" }]
    try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: manifest, options: .atomic)
    try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: manifest.path)
}
func showInstaller() {
    application.activate(ignoringOtherApps: true)
    let alert = NSAlert(); alert.messageText = "安装贴妥辅助组件"
    alert.informativeText = "让 Pages 接收可编辑公式。安装到你的用户目录并连接 Chrome，不需要管理员密码。"
    alert.addButton(withTitle: "安装并继续"); alert.addButton(withTitle: "取消")
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    do {
        try installForCurrentUser()
        let done = NSAlert(); done.messageText = "安装完成"; done.informativeText = "回到 Chrome，继续完成权限设置。"; done.addButton(withTitle: "回到 Chrome"); done.runModal()
        if let chrome = NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome").first { chrome.activate(options: []) }
    } catch {
        let failed = NSAlert(); failed.messageText = "安装未完成"; failed.informativeText = "未能安装组件或登记连接。请保留当前安装包并重试；已有同名文件冲突时不会覆盖其他程序。"; failed.runModal()
    }
}
