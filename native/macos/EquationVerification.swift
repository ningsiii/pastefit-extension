import Foundation

// TASK-62: Pages' pasteboard equation flag does not reliably cover equations
// inside tables. When it is absent, verify Pages' own Word round-trip instead
// of assuming either failure or success from the flag alone.
private final class EquationCounter: NSObject, XMLParserDelegate {
    var count = 0
    var depth = 0
    var nodes = 0
    var valid = true
    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String]) {
        depth += 1; nodes += 1
        if depth > 100 || nodes > 200_000 || (depth == 1 && (name != "document" || namespaceURI != "http://schemas.openxmlformats.org/wordprocessingml/2006/main")) {
            valid = false; parser.abortParsing(); return
        }
        if name == "oMath", namespaceURI == "http://schemas.openxmlformats.org/officeDocument/2006/math" { count += 1 }
    }
    func parser(_ parser: XMLParser, didEndElement: String, namespaceURI: String?, qualifiedName: String?) { depth -= 1 }
}

func nativeEquationCount(_ data: Data) throws -> Int {
    guard !data.isEmpty, data.count <= 12_000_000, let text = String(data: data, encoding: .utf8), !text.contains("<!") else {
        throw BridgeFailure(code: "native-equations-missing")
    }
    let counter = EquationCounter(); let parser = XMLParser(data: data)
    parser.shouldProcessNamespaces = true; parser.shouldResolveExternalEntities = false; parser.delegate = counter
    guard parser.parse(), counter.valid else { throw BridgeFailure(code: "native-equations-missing") }
    return counter.count
}

func verifyNativeEquationRoundTrip(source: Data, exported: Data) throws {
    let expected = try nativeEquationCount(source)
    guard expected > 0, try nativeEquationCount(exported) == expected else { throw BridgeFailure(code: "native-equations-missing") }
}

func exportedWordXML(at file: URL) throws -> Data {
    let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
    guard attributes[.type] as? FileAttributeType == .typeRegular,
        let size = attributes[.size] as? NSNumber, size.intValue > 0, size.intValue <= 20_000_000 else {
        throw BridgeFailure(code: "native-equations-missing")
    }
    // Only our own private staging export is passed here. No source-provided
    // path, archive entry or shell command is accepted; nothing is extracted.
    let process = Process(); let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
    process.arguments = ["-p", file.path, "word/document.xml"]
    process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
    try process.run()
    let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
    DispatchQueue.global().asyncAfter(deadline: .now() + 5, execute: timeout)
    defer { timeout.cancel(); try? pipe.fileHandleForReading.close() }
    let data = pipe.fileHandleForReading.readData(ofLength: 12_000_001)
    if data.count > 12_000_000, process.isRunning { process.terminate() }
    process.waitUntilExit()
    guard process.terminationStatus == 0, !data.isEmpty, data.count <= 12_000_000 else { throw BridgeFailure(code: "native-equations-missing") }
    return data
}
