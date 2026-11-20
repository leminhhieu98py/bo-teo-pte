import AppKit
import ApplicationServices
import Carbon
import WebKit

/// Global shortcut -> save the highlighted word, or (nothing highlighted) let the learner pick
/// a screen area that Gemini reads. The Gemini + Sheet work runs in a hidden worker web view
/// that uses the same lib/save.js as the extension.
final class Saver {
  let hotKey = HotKey()
  private let worker = Worker()
  private let toast = Toast()
  private var busy = false

  func start() {
    hotKey.onPress = { [weak self] in self?.saveFromShortcut() }
    let saved = (Store.shared.value("appPrefs") as? [String: Any])?["shortcut"] as? String
    hotKey.register(id: saved ?? HotKey.presets[0].id)
    worker.load()
  }

  func setShortcut(_ id: String) {
    hotKey.register(id: id)
    var prefs = Store.shared.value("appPrefs") as? [String: Any] ?? [:]
    prefs["shortcut"] = hotKey.current.id
    Store.shared.set(["appPrefs": prefs])
  }

  func saveFromShortcut() {
    guard !busy else { return } // one save at a time
    guard Permissions.accessibilityGranted(prompt: true) else {
      toast.show("Bo cố lên needs Accessibility to read the highlighted word. Allow it in System Settings, then try again.", kind: "info")
      return
    }
    busy = true
    // Let the shortcut keys come up before reading the selection.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
      let picked = Selection.read()
      if !picked.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        self.toast.show("Saving \"\(Self.short(picked.text))\"...", kind: "loading")
        self.worker.run("saveText", ["text": picked.text, "context": picked.context, "source": picked.app]) { self.finish($0) }
      } else {
        self.captureArea(source: picked.app)
      }
    }
  }

  private func captureArea(source: String) {
    guard Permissions.screenGranted(prompt: true) else {
      toast.show("To save from a picture, allow Screen Recording for Bo cố lên in System Settings, then try again.", kind: "info")
      busy = false
      return
    }
    Capture.pickArea { jpeg in
      guard let jpeg else { self.busy = false; return } // Esc: nothing to do
      self.toast.show("Reading the picture...", kind: "loading")
      self.worker.run("saveImage", ["base64": jpeg.base64EncodedString(), "source": source]) { self.finish($0) }
    }
  }

  private func finish(_ result: [String: Any]) {
    busy = false
    toast.show(result["message"] as? String ?? "Something went wrong.",
               kind: result["kind"] as? String ?? "error",
               detail: result["detail"] as? String ?? "")
    if result["openSettings"] as? Bool == true { Web.shared.open(page: "options/options.html") }
  }

  private static func short(_ text: String) -> String {
    let clean = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    return clean.count > 40 ? String(clean.prefix(40)) + "…" : clean
  }
}

// MARK: - Global shortcut

/// Carbon hot key: works in every app and needs no permission.
final class HotKey {
  struct Preset { let id: String; let label: String; let key: Int; let mods: Int }

  // Command+B is not offered: it would steal Bold in every app.
  static let presets: [Preset] = [
    Preset(id: "ctrl-opt-b", label: "⌃⌥B", key: kVK_ANSI_B, mods: controlKey | optionKey),
    Preset(id: "ctrl-opt-s", label: "⌃⌥S", key: kVK_ANSI_S, mods: controlKey | optionKey),
    Preset(id: "ctrl-shift-b", label: "⌃⇧B", key: kVK_ANSI_B, mods: controlKey | shiftKey),
    Preset(id: "opt-cmd-s", label: "⌥⌘S", key: kVK_ANSI_S, mods: optionKey | cmdKey),
    Preset(id: "ctrl-opt-space", label: "⌃⌥Space", key: kVK_Space, mods: controlKey | optionKey),
  ]

  private(set) var current = HotKey.presets[0]
  private var ref: EventHotKeyRef?
  private var installed = false
  var onPress: (() -> Void)?

  func register(id: String) {
    current = Self.presets.first { $0.id == id } ?? Self.presets[0]
    if let ref { UnregisterEventHotKey(ref) }
    ref = nil
    installHandlerOnce()
    let hotKeyId = EventHotKeyID(signature: OSType(0x4243_4C4E), id: 1) // "BCLN"
    RegisterEventHotKey(UInt32(current.key), UInt32(current.mods), hotKeyId, GetApplicationEventTarget(), 0, &ref)
  }

  private func installHandlerOnce() {
    guard !installed else { return }
    installed = true
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
      guard let userData else { return noErr }
      let me = Unmanaged<HotKey>.fromOpaque(userData).takeUnretainedValue()
      DispatchQueue.main.async { me.onPress?() }
      return noErr
    }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
  }
}

// MARK: - Selected text

enum Selection {
  /// The highlighted text in the front app, the text around it (for the example sentence) and
  /// the app name. Uses Accessibility first, then Cmd+C with the clipboard restored afterwards.
  static func read() -> (text: String, context: String, app: String) {
    let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
    let system = AXUIElementCreateSystemWide()
    var focused: CFTypeRef?
    if AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
       let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() {
      let element = focused as! AXUIElement
      var selected: CFTypeRef?
      if AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected) == .success,
         let text = selected as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        var value: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value)
        return (text, String(((value as? String) ?? "").prefix(4000)), appName)
      }
    }
    return (copySelection(), "", appName)
  }

  private static func copySelection() -> String {
    let board = NSPasteboard.general
    let saved = board.pasteboardItems?.map { item -> NSPasteboardItem in
      let copy = NSPasteboardItem()
      for type in item.types { if let data = item.data(forType: type) { copy.setData(data, forType: type) } }
      return copy
    } ?? []
    let before = board.changeCount

    let source = CGEventSource(stateID: .combinedSessionState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_C), keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_C), keyDown: false)
    down?.flags = .maskCommand
    up?.flags = .maskCommand
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)

    let deadline = Date().addingTimeInterval(0.5)
    while board.changeCount == before && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    let text = board.changeCount != before ? (board.string(forType: .string) ?? "") : ""
    if board.changeCount != before {
      board.clearContents()
      if !saved.isEmpty { board.writeObjects(saved) }
    }
    return text
  }
}

// MARK: - Screen area

enum Capture {
  /// macOS's own area picker (Esc cancels). Returns a JPEG, longest side at most 1600 px.
  static func pickArea(completion: @escaping (Data?) -> Void) {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("bocolen-\(UUID().uuidString).png")
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    task.arguments = ["-i", "-x", "-t", "png", file.path]
    task.terminationHandler = { _ in
      let png = try? Data(contentsOf: file)
      try? FileManager.default.removeItem(at: file)
      let jpeg = png.flatMap(jpegData)
      DispatchQueue.main.async { completion(jpeg) }
    }
    do { try task.run() } catch { completion(nil) }
  }

  static func jpegData(_ png: Data) -> Data? {
    guard let rep = NSBitmapImageRep(data: png), rep.pixelsWide >= 20, rep.pixelsHigh >= 20 else { return nil }
    let scale = min(1, 1600 / Double(max(rep.pixelsWide, rep.pixelsHigh)))
    let width = Int(Double(rep.pixelsWide) * scale)
    let height = Int(Double(rep.pixelsHigh) * scale)
    guard let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: out)
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    rep.draw(in: NSRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    return out.representation(using: .jpeg, properties: [.compressionFactor: 0.9])
  }
}

// MARK: - Worker web view

/// Hidden page (native/worker.html) that runs lib/save.js, so saving uses the tested JS code.
final class Worker: NSObject, WKNavigationDelegate {
  private var view: WKWebView?
  private var ready = false
  private var waiting: [() -> Void] = []

  func load() {
    let (_, view) = Web.shared.makeWebView()
    view.navigationDelegate = self
    view.load(URLRequest(url: WebRoot.url("native/worker.html")))
    self.view = view
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    ready = true
    waiting.forEach { $0() }
    waiting.removeAll()
  }

  func run(_ method: String, _ job: [String: Any], completion: @escaping ([String: Any]) -> Void) {
    let go = { [weak self] in
      guard let view = self?.view else { return completion(["message": "The saver is not ready.", "kind": "error"]) }
      view.callAsyncJavaScript("return await window.boWorker.\(method)(job)", arguments: ["job": job], in: nil, in: .page) { result in
        switch result {
        case .success(let value): completion(value as? [String: Any] ?? ["message": "Something went wrong.", "kind": "error"])
        case .failure(let error): completion(["message": "Could not save the word.", "kind": "error", "detail": error.localizedDescription])
        }
      }
    }
    if ready { go() } else { waiting.append(go) }
  }
}

// MARK: - Toast

/// The same cute toast as the extension, floating at the top right of the screen.
final class Toast {
  private var panel: NSPanel?
  private var view: WKWebView?
  private var hideWork: DispatchWorkItem?

  func show(_ message: String, kind: String, detail: String = "") {
    let panel = self.panel ?? makePanel()
    let args: [String: Any] = ["message": message, "kind": kind, "detail": detail]
    view?.callAsyncJavaScript("window.showToast && window.showToast(message, kind, detail)", arguments: args, in: nil, in: .page, completionHandler: nil)
    if let screen = NSScreen.main {
      let frame = screen.visibleFrame
      panel.setFrameOrigin(NSPoint(x: frame.maxX - panel.frame.width - 12, y: frame.maxY - panel.frame.height - 8))
    }
    panel.orderFrontRegardless()
    hideWork?.cancel()
    guard kind != "loading" else { return }
    let work = DispatchWorkItem { [weak self] in self?.panel?.orderOut(nil) }
    hideWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + (kind == "error" ? 10 : 4.5), execute: work)
  }

  private func makePanel() -> NSPanel {
    let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 420, height: 150),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isFloatingPanel = true
    panel.level = .statusBar
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = false
    panel.ignoresMouseEvents = true
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    let (_, view) = Web.shared.makeWebView(transparent: true)
    view.load(URLRequest(url: WebRoot.url("native/toast.html")))
    panel.contentView = view
    self.panel = panel
    self.view = view
    return panel
  }
}
