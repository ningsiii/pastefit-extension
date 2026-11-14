import Foundation

struct BridgeFailure: Error { let code: String }

private final class SafeWordXML: NSObject, XMLParserDelegate {
    var valid = true
    var depth = 0
    var nodes = 0
    let tags = Set("document body p pPr pStyle outlineLvl r rPr t b i u strike vertAlign br tab tabs spacing ind jc numPr numId ilvl tbl tblPr tblW tblBorders top left bottom right insideH insideV tblGrid gridCol tr trPr tc tcPr tcW gridSpan vMerge sectPr pgSz pgMar oMath oMathPara r sSub sSup sSubSup e sub sup f fPr type num den rad radPr degHide deg d dPr begChr endChr sepChr m mPr mr mc mcPr count sPre limLow limUpp lim nary naryPr chr limLoc subHide supHide acc accPr bar barPr pos groupChr groupChrPr borderBox borderBoxPr phantom phantomPr show transp eqArr eqArrPr ctrlPr sty nor sz szCs color rFonts".split(separator: " ").map(String.init))
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes: [String: String]) {
        depth += 1; nodes += 1
        let name = elementName.split(separator: ":").last.map(String.init) ?? ""
        if !tags.contains(name) || depth > 80 || nodes > 80000 { valid = false; parser.abortParsing() }
        for (key, value) in attributes where key.hasPrefix("xmlns") {
            if !["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://schemas.openxmlformats.org/officeDocument/2006/math"].contains(value) { valid = false; parser.abortParsing() }
        }
        if depth == 1 && elementName != "w:document" { valid = false; parser.abortParsing() }
        if !elementName.hasPrefix("w:") && !elementName.hasPrefix("m:") { valid = false; parser.abortParsing() }
    }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) { depth -= 1 }
}

func validateDocumentXML(_ text: String) throws -> Data {
    let data = Data(text.utf8)
    guard data.count <= 3_000_000, !text.contains("<!"), !text.contains("<?") else { throw BridgeFailure(code: "invalid-document") }
    let validator = SafeWordXML(); let parser = XMLParser(data: data)
    parser.shouldResolveExternalEntities = false; parser.delegate = validator
    guard parser.parse(), validator.valid else { throw BridgeFailure(code: "invalid-document") }
    return data
}

private extension Data {
    mutating func le16(_ value: UInt16) { append(UInt8(value & 255)); append(UInt8(value >> 8)) }
    mutating func le32(_ value: UInt32) { le16(UInt16(value & 65535)); le16(UInt16(value >> 16)) }
}
private func crc32(_ bytes: Data) -> UInt32 {
    var crc: UInt32 = 0xffffffff
    for byte in bytes {
        crc ^= UInt32(byte)
        for _ in 0..<8 { crc = (crc >> 1) ^ (crc & 1 == 1 ? 0xedb88320 : 0) }
    }
    return ~crc
}

// Fixed OPC package, stored ZIP entries; no executable content, external
// relationships, macros, shell, or third-party runtime dependencies.
func makePackage(_ xml: Data) -> Data {
    // Fixed built-in paragraph styles, never supplied by the source website.
    // A pStyle reference without this part silently becomes Body in Pages.
    let headingStyles = (1...6).map { level in
        "<w:style w:type=\"paragraph\" w:styleId=\"Heading\(level)\"><w:name w:val=\"heading \(level)\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val=\"\(level - 1)\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"\([40,32,28,24,22,20][level - 1])\"/></w:rPr></w:style>"
    }.joined()
    let styles = "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>\(headingStyles)</w:styles>"
    let entries: [(String, Data)] = [
        ("[Content_Types].xml", Data("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>".utf8)),
        ("_rels/.rels", Data("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>".utf8)),
        ("word/document.xml", xml),
        ("word/styles.xml", Data(styles.utf8)),
        ("word/_rels/document.xml.rels", Data("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>".utf8))
    ]
    var archive = Data(); var directory = Data()
    for (path, data) in entries {
        let filename = Data(path.utf8); let offset = UInt32(archive.count); let crc = crc32(data); let size = UInt32(data.count)
        archive.le32(0x04034b50); archive.le16(20); archive.le16(0); archive.le16(0); archive.le16(0); archive.le16(0x21); archive.le32(crc); archive.le32(size); archive.le32(size); archive.le16(UInt16(filename.count)); archive.le16(0); archive.append(filename); archive.append(data)
        directory.le32(0x02014b50); directory.le16(20); directory.le16(20); directory.le16(0); directory.le16(0); directory.le16(0); directory.le16(0x21); directory.le32(crc); directory.le32(size); directory.le32(size); directory.le16(UInt16(filename.count)); directory.le16(0); directory.le16(0); directory.le16(0); directory.le16(0); directory.le32(0); directory.le32(offset); directory.append(filename)
    }
    let offset = UInt32(archive.count); archive.append(directory)
    archive.le32(0x06054b50); archive.le16(0); archive.le16(0); archive.le16(UInt16(entries.count)); archive.le16(UInt16(entries.count)); archive.le32(UInt32(directory.count)); archive.le32(offset); archive.le16(0)
    return archive
}
