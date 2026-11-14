import AppKit
import ApplicationServices
import Foundation

private let pagesID = "com.apple.Pages"
private func appleString(_ value: String) -> String { "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
private func script(_ source: String) throws -> NSAppleEventDescriptor {
    var error: NSDictionary?
    guard let compiled = NSAppleScript(source: source) else { throw BridgeFailure(code: "automation-unavailable") }
    let result = compiled.executeAndReturnError(&error)
    if let error = error { throw BridgeFailure(code: (error[NSAppleScript.errorNumber] as? Int) == -1743 ? "automation-permission" : "pages-conversion") }
    return result
}
private func value(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var result: CFTypeRef?; guard AXUIElementCopyAttributeValue(element, attribute as CFString, &result) == .success else { return nil }; return result
}
private func children(_ element: AXUIElement) -> [AXUIElement] { value(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] }
private func find(_ root: AXUIElement, depth: Int = 0, predicate: (AXUIElement) -> Bool) -> AXUIElement? {
    if predicate(root) { return root }; if depth > 16 { return nil }
    for child in children(root) { if let match = find(child, depth: depth + 1, predicate: predicate) { return match } }; return nil
}
private func pump(_ interval: TimeInterval = 0.1) { RunLoop.current.run(until: Date().addingTimeInterval(interval)) }

func convertWithPages(_ xml: String, standard: StandardClipboard? = nil, cancelled: () -> Bool = { false }) throws {
    guard AXIsProcessTrusted() else { throw BridgeFailure(code: "accessibility-permission") }
    let content = try validateDocumentXML(xml)
    let originalCount = NSPasteboard.general.changeCount
    let previous = NSWorkspace.shared.frontmostApplication
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("PasteFit-" + UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    let input = folder.appendingPathComponent("PasteFit-Transfer.docx")
    let native = folder.appendingPathComponent("PasteFit-" + UUID().uuidString + ".pages")
    try makePackage(content).write(to: input, options: .atomic)
    var documentID: String?
    defer {
        if let id = documentID { _ = try? script("tell application id \"\(pagesID)\"\nif exists document id \(appleString(id)) then close document id \(appleString(id)) saving no\nend tell") }
        try? FileManager.default.removeItem(at: folder)
        if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == pagesID { previous?.activate(options: []) }
    }
    // Save immediately to our private local temp folder. Never use the user's
    // iCloud/default document destination for the intermediate conversion.
    let id = try script("""
    with timeout of 25 seconds
        tell application id "\(pagesID)"
            set bridgeDocument to open POSIX file \(appleString(input.path))
            return id of bridgeDocument
        end tell
    end timeout
    """).stringValue
    guard let id = id, !id.isEmpty else { throw BridgeFailure(code: "pages-conversion") }; documentID = id
    _ = try script("""
    with timeout of 25 seconds
        tell application id "\(pagesID)"
            save document id \(appleString(id)) in POSIX file \(appleString(native.path))
        end tell
    end timeout
    """)
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: pagesID).first else { throw BridgeFailure(code: "pages-unavailable") }
    app.activate(options: [])
    let ax = AXUIElementCreateApplication(app.processIdentifier)
    let deadline = Date().addingTimeInterval(8)
    var matchingWindow: AXUIElement?
    while Date() < deadline {
        let windows = value(ax, kAXWindowsAttribute) as? [AXUIElement] ?? []
        matchingWindow = windows.first { (value($0, kAXTitleAttribute) as? String ?? "").contains(native.deletingPathExtension().lastPathComponent) }
        if matchingWindow != nil { break }; pump()
    }
    guard let window = matchingWindow else { throw BridgeFailure(code: "staging-window") }
    guard AXUIElementPerformAction(window, kAXRaiseAction as CFString) == .success else { throw BridgeFailure(code: "staging-window") }
    pump()
    guard let body = find(window, predicate: { element in
        (value(element, kAXRoleAttribute) as? String) == kAXTextAreaRole && ["正文", "Body"].contains(value(element, kAXDescriptionAttribute) as? String ?? "")
    }) else { throw BridgeFailure(code: "staging-body") }
    guard AXUIElementSetAttributeValue(body, kAXFocusedAttribute as CFString, kCFBooleanTrue) == .success else { throw BridgeFailure(code: "staging-focus") }
    func checkStaging() throws {
        guard !cancelled() else { throw BridgeFailure(code: "conversion-timeout") }
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier,
            let focusedRef = value(ax, kAXFocusedWindowAttribute), CFGetTypeID(focusedRef) == AXUIElementGetTypeID(),
            (value(unsafeBitCast(focusedRef, to: AXUIElement.self), kAXTitleAttribute) as? String ?? "").contains(native.deletingPathExtension().lastPathComponent)
        else { throw BridgeFailure(code: "focus-changed") }
    }
    func shortcut(_ key: CGKeyCode) throws {
        try checkStaging()
        guard let source = CGEventSource(stateID: .privateState),
            let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true),
            let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false) else { throw BridgeFailure(code: "staging-keyboard") }
        down.flags = .maskCommand; up.flags = .maskCommand
        down.postToPid(app.processIdentifier); up.postToPid(app.processIdentifier)
    }
    guard NSPasteboard.general.changeCount == originalCount else { throw BridgeFailure(code: "clipboard-changed") }
    try shortcut(0); pump(); try checkStaging()
    guard !(value(body, kAXSelectedTextAttribute) as? String ?? "").isEmpty else { throw BridgeFailure(code: "staging-selection") }
    guard NSPasteboard.general.changeCount == originalCount else { throw BridgeFailure(code: "clipboard-changed") }
    try shortcut(8)
    let copyDeadline = Date().addingTimeInterval(5)
    while Date() < copyDeadline && NSPasteboard.general.changeCount == originalCount { pump() }
    guard NSPasteboard.general.changeCount != originalCount else { throw BridgeFailure(code: "clipboard-copy-timeout") }
    let copiedCount = NSPasteboard.general.changeCount
    let types = NSPasteboard.general.types?.map(\.rawValue) ?? []
    guard types.contains("com.apple.iWork.TSPNativeData") else { throw BridgeFailure(code: "native-equations-missing") }
    // Materialize all lazy representations before closing the staging document.
    var items = (NSPasteboard.general.pasteboardItems ?? []).map { source -> NSPasteboardItem in
        let item = NSPasteboardItem(); for type in source.types { if let data = source.data(forType: type) { item.setData(data, forType: type) } }; return item
    }
    guard !items.isEmpty else { throw BridgeFailure(code: "native-equations-missing") }
    if xml.contains("<m:oMath>"), !types.contains("com.apple.iWork.pasteboardState.hasNativeEquation") {
        try checkStaging()
        let verified = folder.appendingPathComponent("PasteFit-Verify.docx")
        _ = try script("""
        with timeout of 15 seconds
            tell application id "\(pagesID)"
                export document id \(appleString(id)) to POSIX file \(appleString(verified.path)) as Microsoft Word
            end tell
        end timeout
        """)
        try verifyNativeEquationRoundTrip(source: content, exported: exportedWordXML(at: verified))
        try checkStaging()
    }
    if let standard = standard {
        guard items.count == 1 else { throw BridgeFailure(code: "clipboard-layout") }
        items = [try standard.add(to: items[0])]
    }
    guard NSPasteboard.general.changeCount == copiedCount else { throw BridgeFailure(code: "clipboard-changed") }
    guard !cancelled() else { throw BridgeFailure(code: "conversion-timeout") }
    NSPasteboard.general.clearContents()
    guard NSPasteboard.general.writeObjects(items) else { throw BridgeFailure(code: "clipboard-write") }
}
