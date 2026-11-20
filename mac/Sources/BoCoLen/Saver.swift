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
    toast.prepare()
  }

  /// False when macOS refused the combo (the previous shortcut is kept).
  func setShortcut(_ id: String) -> Bool {
    let ok = hotKey.register(id: id)
    var prefs = Store.shared.value("appPrefs") as? [String: Any] ?? [:]
    prefs["shortcut"] = hotKey.current.id
    Store.shared.set(["appPrefs": prefs])
    return ok
  }

  private var busySince = Date.distantPast

  func saveFromShortcut() {
    // One save at a time. A save cannot take longer than the 60 s timeouts, so a very old busy
    // flag means something went wrong: unlock instead of ignoring the shortcut forever.
    if busy && Date().timeIntervalSince(busySince) < 150 {
      toast.show("Still saving the last word, one moment...", kind: "info")
      return
    }
    guard Permissions.accessibilityGranted(prompt: true) else {
      toast.show("Bo cố lên needs Accessibility to read the highlighted word. Allow it in System Settings, then try again.", kind: "info")
      return
    }
    busy = true
    busySince = Date()
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

  /// Registers the preset; if macOS refuses it (another app owns the combo), the previous shortcut
  /// stays active and false is returned.
  @discardableResult
  func register(id: String) -> Bool {
    let wanted = Self.presets.first { $0.id == id } ?? Self.presets[0]
    installHandlerOnce()
    if let ref { UnregisterEventHotKey(ref) }
    ref = nil
    if tryRegister(wanted) {
      current = wanted
      return true
    }
    _ = tryRegister(current)
    return false
  }

  private func tryRegister(_ preset: Preset) -> Bool {
    var newRef: EventHotKeyRef?
    let hotKeyId = EventHotKeyID(signature: OSType(0x4243_4C4E), id: 1) // "BCLN"
    let status = RegisterEventHotKey(UInt32(preset.key), UInt32(preset.mods), hotKeyId, GetApplicationEventTarget(), 0, &newRef)
    guard status == noErr, let newRef else { return false }
    ref = newRef
    return true
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
    AXUIElementSetMessagingTimeout(system, 0.5) // a hung app must not freeze Bo co len
    var focused: CFTypeRef?
    if AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
       let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() {
      let element = focused as! AXUIElement
      var selected: CFTypeRef?
      if AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected) == .success,
         let text = selected as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return (text, context(of: element), appName)
      }
    }
    return (copySelection(), "", appName)
  }

  /// About 4000 characters of the field's text around the selection (for the example sentence).
  private static func context(of element: AXUIElement) -> String {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value) == .success,
          let full = value as? String else { return "" }
    let text = full as NSString
    var location = 0
    var rangeValue: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &rangeValue) == .success,
       let rangeValue, CFGetTypeID(rangeValue) == AXValueGetTypeID() {
      var range = CFRange()
      if AXValueGetValue(rangeValue as! AXValue, .cfRange, &range) { location = range.location }
    }
    let start = max(0, min(text.length, location - 2000))
    let length = min(4000, text.length - start)
    return text.substring(with: NSRange(location: start, length: length))
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
    // Password managers mark secrets as concealed/transient: never put those back.
    let secret = saved.contains { item in
      item.types.contains { ["org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType"].contains($0.rawValue) }
    }
    let restore = {
      board.clearContents()
      if !saved.isEmpty && !secret { board.writeObjects(saved) }
    }
    if board.changeCount != before {
      let text = board.string(forType: .string) ?? ""
      restore()
      return text
    }
    // The app may still copy after we gave up: put the learner's clipboard back if it does.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      if board.changeCount != before { restore() }
    }
    return ""
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
/// It reloads itself if its web content process dies, and fails queued jobs if it cannot load.
final class Worker: NSObject, WKNavigationDelegate {
  private typealias Job = (method: String, job: [String: Any], done: ([String: Any]) -> Void)
  private var view: WKWebView?
  private var ready = false
  private var waiting: [Job] = []

  func load() {
    if view == nil {
      let (_, view) = Web.shared.makeWebView()
      view.navigationDelegate = self
      self.view = view
    }
    ready = false
    view?.load(URLRequest(url: WebRoot.url("native/worker.html")))
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    ready = true
    let jobs = waiting
    waiting.removeAll()
    jobs.forEach { send($0) }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loadFailed(error) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loadFailed(error) }

  private func loadFailed(_ error: Error) {
    ready = false
    let jobs = waiting
    waiting.removeAll()
    jobs.forEach { $0.done(["message": "The saver could not start. Please try again.", "kind": "error", "detail": error.localizedDescription]) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.load() }
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    load() // queued jobs run when the page is back
  }

  func run(_ method: String, _ job: [String: Any], completion: @escaping ([String: Any]) -> Void) {
    let item: Job = (method, job, completion)
    if ready { send(item) } else { waiting.append(item) }
  }

  private func send(_ item: Job) {
    guard let view else { return item.done(["message": "The saver is not ready.", "kind": "error"]) }
    view.callAsyncJavaScript("return await window.boWorker.\(item.method)(job)", arguments: ["job": item.job], in: nil, in: .page) { result in
      switch result {
      case .success(let value): item.done(value as? [String: Any] ?? ["message": "Something went wrong.", "kind": "error"])
      case .failure(let error): item.done(["message": "Could not save the word.", "kind": "error", "detail": error.localizedDescription])
      }
    }
  }
}

// MARK: - Toast

/// The same cute toast as the extension, floating at the top right of the screen. Messages that
/// arrive before the toast page has loaded are kept and shown once it is ready.
final class Toast: NSObject, WKNavigationDelegate {
  private var panel: NSPanel?
  private var view: WKWebView?
  private var loaded = false
  private var pending: (message: String, kind: String, detail: String)?
  private var hideWork: DispatchWorkItem?

  func prepare() {
    guard panel == nil else { return }
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
    view.navigationDelegate = self
    view.load(URLRequest(url: WebRoot.url("native/toast.html")))
    panel.contentView = view
    self.panel = panel
    self.view = view
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loaded = true
    if let pending {
      self.pending = nil
      show(pending.message, kind: pending.kind, detail: pending.detail)
    }
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    loaded = false
    webView.reload()
  }

  func show(_ message: String, kind: String, detail: String = "") {
    prepare()
    guard loaded, let panel else {
      pending = (message, kind, detail)
      return
    }
    let args: [String: Any] = ["message": message, "kind": kind, "detail": detail]
    view?.callAsyncJavaScript("window.showToast(message, kind, detail)", arguments: args, in: nil, in: .page, completionHandler: nil)
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
}
