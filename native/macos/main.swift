import AppKit
import ApplicationServices
import Darwin
import Foundation

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let arguments = CommandLine.arguments
let allowedOrigins = Set(extensionIDs.map { "chrome-extension://\($0)/" })

func convertLocally(_ text: String, standard: StandardClipboard? = nil, cancelled: () -> Bool = { false }) -> [String: Any] {
    let lockPath = FileManager.default.temporaryDirectory.appendingPathComponent("pastefit-pages-\(getuid()).lock").path
    let fd = Darwin.open(lockPath, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
    guard fd >= 0 else { return ["ok": false, "code": "busy"] }
    defer { Darwin.close(fd) }
    var info = stat()
    guard fstat(fd, &info) == 0, info.st_uid == getuid(), flock(fd, LOCK_EX | LOCK_NB) == 0 else { return ["ok": false, "code": "busy"] }
    defer { flock(fd, LOCK_UN) }
    do { try convertWithPages(text, standard: standard, cancelled: cancelled); return ["ok": true] }
    catch let failure as BridgeFailure { return ["ok": false, "code": failure.code] }
    catch { return ["ok": false, "code": "conversion-failed"] }
}

// Native Messaging starts under Chrome's process attribution. Launch a real
// app worker so Accessibility/Automation belongs to PasteFitBridge, not Chrome
// or the terminal. Job files are private, local, transient and never user UI.
func resultForXML(_ text: String, standard: StandardClipboard? = nil, command: String = "copy-pages-equations") -> [String: Any] {
    do {
        if command == "copy-pages-equations" { _ = try validateDocumentXML(text) }
        let job = FileManager.default.temporaryDirectory.appendingPathComponent("PasteFit-Job-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: job, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: job) }
        let input = job.appendingPathComponent("input.json"); let output = job.appendingPathComponent("result.json")
        var request = ["documentXml": text, "command": command]
        if let standard = standard { request["html"] = standard.html; request["plain"] = standard.plain }
        let jobData = try JSONSerialization.data(withJSONObject: request)
        guard jobData.count <= 4_000_000 else { throw BridgeFailure(code: "invalid-representations") }
        try jobData.write(to: input, options: .atomic)
        let configuration = NSWorkspace.OpenConfiguration(); configuration.arguments = ["--run-job", job.path]
        configuration.createsNewApplicationInstance = true; configuration.activates = false
        var launched = false; var launchError = false
        NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: configuration) { _, error in launched = true; launchError = error != nil }
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if launchError { return ["ok": false, "code": "worker-launch"] }
            if launched, let data = try? Data(contentsOf: output), data.count < 4096,
                let response = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { return response }
        }
        return ["ok": false, "code": "conversion-timeout"]
    } catch let failure as BridgeFailure { return ["ok": false, "code": failure.code] }
    catch { return ["ok": false, "code": "conversion-failed"] }
}
if arguments.count == 3 && arguments[1] == "--run-job" {
    let job = URL(fileURLWithPath: arguments[2]).standardizedFileURL
    let temp = FileManager.default.temporaryDirectory.standardizedFileURL
    let attributes = try FileManager.default.attributesOfItem(atPath: job.path)
    guard job.deletingLastPathComponent() == temp, job.lastPathComponent.hasPrefix("PasteFit-Job-"),
        attributes[.type] as? FileAttributeType == .typeDirectory, attributes[.ownerAccountID] as? UInt32 == getuid(),
        (attributes[.posixPermissions] as? Int ?? 0) & 0o077 == 0 else { exit(2) }
    let data = try Data(contentsOf: job.appendingPathComponent("input.json"))
    guard data.count <= 4_000_000,
        let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let xml = request["documentXml"] as? String else { exit(2) }
    let standard = try StandardClipboard.parse(request)
    application.finishLaunching()
    let command = request["command"] as? String ?? "copy-pages-equations"
    guard command == "copy-pages-equations" || setupCommands.contains(command) else { exit(2) }
    let response = command == "copy-pages-equations" ? convertLocally(xml, standard: standard, cancelled: { !FileManager.default.fileExists(atPath: job.path) }) : setupResponse(command, cancelled: { !FileManager.default.fileExists(atPath: job.path) })
    try JSONSerialization.data(withJSONObject: response).write(to: job.appendingPathComponent("result.json"), options: .atomic)
    exit(0)
}
if arguments.count == 1 || arguments.contains("--setup") {
    application.finishLaunching(); showInstaller(); exit(0)
}
if arguments.count == 2 && arguments[1] == "--probe-status" {
    let response = resultForXML("", command: "bridge-status")
    let data = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]); print(String(data: data, encoding: .utf8)!); exit(0)
}
if arguments.count == 3 && arguments[1] == "--probe-xml" {
    let response = resultForXML(try String(contentsOfFile: arguments[2], encoding: .utf8))
    let data = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]); print(String(data: data, encoding: .utf8)!); exit(response["ok"] as? Bool == true ? 0 : 1)
}
if arguments.count == 2 && arguments[1] == "--representation-test" {
    let native = NSPasteboardItem()
    native.setData(Data([1, 2, 3]), forType: NSPasteboard.PasteboardType("com.apple.iWork.TSPNativeData"))
    native.setData(Data([9]), forType: NSPasteboard.PasteboardType("com.apple.iWork.TSPData.1"))
    native.setString("old fallback", forType: .rtf)
    native.setString("old fallback", forType: NSPasteboard.PasteboardType("com.apple.flat-rtfd"))
    native.setString("missing equation", forType: .string)
    let standard = try StandardClipboard.parse(["html": "<p>BEGIN <math><mi>x</mi></math> END</p>", "plain": "BEGIN \\(x\\) END 👨‍👩‍👧‍👦"])!
    let merged = try standard.add(to: native)
    precondition(merged.data(forType: NSPasteboard.PasteboardType("com.apple.iWork.TSPNativeData")) == Data([1, 2, 3]))
    precondition(merged.data(forType: NSPasteboard.PasteboardType("com.apple.iWork.TSPData.1")) == Data([9]))
    precondition(merged.string(forType: .html) == standard.html && merged.string(forType: .string) == standard.plain)
    precondition(String(data: merged.data(forType: NSPasteboard.PasteboardType("public.utf16-external-plain-text"))!, encoding: .utf16) == standard.plain)
    precondition(!merged.types.contains(.rtf) && !merged.types.contains(NSPasteboard.PasteboardType("com.apple.flat-rtfd")))
    print("Combined native / HTML / UTF-8 / UTF-16 representations passed"); exit(0)
}
if arguments.count == 3 && arguments[1] == "--package-test" {
    let xml = "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\"><w:body><w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p></w:body></w:document>"
    try makePackage(validateDocumentXML(xml)).write(to: URL(fileURLWithPath: arguments[2]))
    for bad in ["<!DOCTYPE x><w:document/>", "<w:document><w:body><w:altChunk/></w:body></w:document>", "<w:document xmlns:w=\"https://bad.example\"><w:body/></w:document>"] {
        do { _ = try validateDocumentXML(bad); fatalError("accepted unsafe XML") } catch {}
    }
    print("Native package and XML rejection checks passed"); exit(0)
}
guard arguments.count >= 2 && allowedOrigins.contains(arguments[1]) else { exit(2) }
let input = FileHandle.standardInput
func readExact(_ length: Int) -> Data? {
    var data = Data()
    while data.count < length { let part = input.readData(ofLength: length - data.count); if part.isEmpty { return nil }; data.append(part) }
    return data
}
guard let header = readExact(4) else { exit(2) }
let length = header.enumerated().reduce(UInt32(0)) { $0 | (UInt32($1.element) << ($1.offset * 8)) }
guard length > 0 && length <= 4_000_000, let data = readExact(Int(length)),
      let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let command = message["type"] as? String,
      command == "copy-pages-equations" || setupCommands.contains(command) else { exit(2) }
let response: [String: Any]
if command == "copy-pages-equations" {
    guard let xml = message["documentXml"] as? String else { exit(2) }
    do { response = resultForXML(xml, standard: try StandardClipboard.parse(message)) }
    catch { response = ["ok": false, "code": "invalid-representations"] }
} else {
    guard message.count == 1 else { exit(2) }
    response = resultForXML("", command: command)
}
let encoded = try JSONSerialization.data(withJSONObject: response)
var size = UInt32(encoded.count).littleEndian
FileHandle.standardOutput.write(Data(bytes: &size, count: 4)); FileHandle.standardOutput.write(encoded)
