import AppKit
import WebKit

/// Creates the web views (all share the bocolen:// scheme, the chrome shim and the bridge) and
/// manages the page windows: review, history and settings each open at most once.
final class Web: NSObject, WKUIDelegate, WKNavigationDelegate, NSWindowDelegate {
  static let shared = Web()

  let webRoot: URL
  private let pool = WKProcessPool()
  private var shimSource = ""
  private(set) var views: [Int: WKWebView] = [:]
  private var windows: [Int: NSWindow] = [:]
  private var nextId = 1
  var handler: ((String, [String: Any], Int, @escaping (Any?) -> Void) -> Void)?
  var onWindowOpened: (() -> Void)?

  override init() {
    webRoot = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    super.init()
    shimSource = (try? String(contentsOf: webRoot.appendingPathComponent("native/chrome-shim.js"), encoding: .utf8)) ?? ""
  }

  /// A web view wired to the app. `id` identifies it in bridge calls (window.current etc.).
  func makeWebView(id: Int? = nil, transparent: Bool = false) -> (Int, WKWebView) {
    let viewId = id ?? allocateId()
    let config = WKWebViewConfiguration()
    config.processPool = pool
    config.setURLSchemeHandler(WebRoot(root: webRoot), forURLScheme: WebRoot.scheme)
    config.mediaTypesRequiringUserActionForPlayback = []
    let content = config.userContentController
    content.addUserScript(WKUserScript(source: shimSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    content.addScriptMessageHandler(Bridge(viewId: viewId, web: self), contentWorld: .page, name: "bocolen")
    let view = WKWebView(frame: .zero, configuration: config)
    view.uiDelegate = self
    view.navigationDelegate = self
    if transparent { view.setValue(false, forKey: "drawsBackground") }
    views[viewId] = view
    return (viewId, view)
  }

  func allocateId() -> Int {
    defer { nextId += 1 }
    return nextId
  }

  func forget(_ id: Int) {
    views[id] = nil
  }

  // MARK: page windows

  private static let sizes: [String: NSSize] = [
    "review/review.html": NSSize(width: 1100, height: 780),
    "history/history.html": NSSize(width: 820, height: 900),
    "options/options.html": NSSize(width: 720, height: 900),
  ]

  /// Opens (or focuses) the window for a bocolen:// URL. Returns its id.
  @discardableResult
  func open(_ url: URL) -> Int {
    let page = Self.page(of: url)
    if let id = windowId(forPage: page) {
      if url.fragment != nil { views[id]?.load(URLRequest(url: url)) }
      focus(id)
      return id
    }
    let (id, view) = makeWebView()
    let size = Self.sizes[page] ?? NSSize(width: 900, height: 800)
    let window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
    window.title = "Bo cố lên"
    window.isReleasedWhenClosed = false
    window.contentView = view
    window.delegate = self
    window.center()
    windows[id] = window
    view.load(URLRequest(url: url))
    focus(id)
    onWindowOpened?()
    return id
  }

  func open(page: String) {
    open(WebRoot.url(page))
  }

  static func page(of url: URL) -> String {
    url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
  }

  private func windowId(forPage page: String) -> Int? {
    windows.first { id, _ in views[id].flatMap { $0.url }.map(Self.page) == page }?.key
  }

  /// chrome.runtime.getContexts: open windows showing one of the URLs.
  func find(urls: [String]) -> [[String: Int]] {
    let pages = Set(urls.compactMap { URL(string: $0) }.map(Self.page))
    return windows.keys.sorted().compactMap { id in
      guard let url = views[id]?.url, pages.contains(Self.page(of: url)) else { return nil }
      return ["tabId": id, "windowId": id]
    }
  }

  func focus(_ id: Int) {
    guard let window = windows[id] else { return }
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
  }

  func close(_ id: Int) {
    windows[id]?.close()
  }

  func windowWillClose(_ notification: Notification) {
    guard let window = notification.object as? NSWindow,
          let id = windows.first(where: { $0.value === window })?.key else { return }
    windows[id] = nil
    views[id]?.configuration.userContentController.removeScriptMessageHandler(forName: "bocolen", contentWorld: .page)
    views[id] = nil
  }

  /// chrome.storage.onChanged for every page.
  func broadcast(changes: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(changes),
          let raw = try? JSONSerialization.data(withJSONObject: changes),
          let json = String(data: raw, encoding: .utf8) else { return }
    for view in views.values {
      view.evaluateJavaScript("window.__boStorageChanged && window.__boStorageChanged(\(json))", completionHandler: nil)
    }
  }

  // MARK: WKUIDelegate

  /// The review page records the learner's voice: allow the microphone for our own pages.
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
               initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
               decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    decisionHandler(origin.protocol == WebRoot.scheme ? .grant : .deny)
  }

  /// Links to the web (for example the Gemini key page) open in the default browser.
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, ["http", "https"].contains(url.scheme ?? ""), action.navigationType == .linkActivated {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.runModal()
    completionHandler()
  }
}

/// Receives chrome-shim calls from one web view and answers them (postMessage returns a Promise).
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
  let viewId: Int
  weak var web: Web?

  init(viewId: Int, web: Web) {
    self.viewId = viewId
    self.web = web
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                             replyHandler: @escaping (Any?, String?) -> Void) {
    guard let body = message.body as? [String: Any], let action = body["action"] as? String else {
      replyHandler(nil, "Bad message")
      return
    }
    guard let handler = web?.handler else {
      replyHandler(nil, "App is not ready")
      return
    }
    handler(action, body, viewId) { result in replyHandler(result, nil) }
  }
}
