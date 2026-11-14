import AppKit
import Foundation

// Standard browser representations travel as bounded inert strings. They are
// never interpreted by AppleScript, opened as a document or fetched over HTTP.
struct StandardClipboard {
    let html: String
    let plain: String
    static func parse(_ message: [String: Any]) throws -> StandardClipboard? {
        if message["html"] == nil && message["plain"] == nil { return nil }
        guard let html = message["html"] as? String, let plain = message["plain"] as? String,
            !html.isEmpty, !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            html.utf8.count + plain.utf8.count <= 2_000_000,
            !html.contains("\0"), !plain.contains("\0") else { throw BridgeFailure(code: "invalid-representations") }
        return StandardClipboard(html: html, plain: plain)
    }
    func add(to source: NSPasteboardItem) throws -> NSPasteboardItem {
        let item = NSPasteboardItem()
        // Pages uses these native types. Drop its RTF/RTFD (which contain image
        // fallbacks) so other applications can choose our MathML HTML instead.
        for type in source.types where type.rawValue.hasPrefix("com.apple.iWork.") {
            guard let data = source.data(forType: type), item.setData(data, forType: type) else { throw BridgeFailure(code: "clipboard-materialize") }
        }
        guard item.setData(Data(html.utf8), forType: .html),
            item.setString(plain, forType: .string),
            let utf16 = plain.data(using: .utf16), item.setData(utf16, forType: NSPasteboard.PasteboardType("public.utf16-external-plain-text"))
        else { throw BridgeFailure(code: "clipboard-write") }
        return item
    }
}
