import AppKit
import WebKit

/// `BoCoLen --selftest <dir>` loads every page in an off-screen window, reports JavaScript errors
/// and the page state, saves a screenshot per page, then quits. It uses a separate storage file
/// (BOCOLEN_STORE_DIR) so it never touches the learner's data and never writes to the Sheet.
enum SelfTest {
  private static let pages = [
    ("popup", "popup/popup.html", NSSize(width: 340, height: 520)),
    ("review", "review/review.html", NSSize(width: 1100, height: 780)),
    ("history", "history/history.html", NSSize(width: 820, height: 900)),
    ("options", "options/options.html", NSSize(width: 720, height: 1500)),
    ("toast", "native/toast.html", NSSize(width: 420, height: 150)),
    ("worker", "native/worker.html", NSSize(width: 200, height: 100)),
  ]
  private static var windows: [NSWindow] = []

  static func runIfRequested() -> Bool {
    let args = CommandLine.arguments
    // `--verify-signature <app>`: would the updater accept this app? (signed like the running one)
    if let i = args.firstIndex(of: "--verify-signature"), i + 1 < args.count {
      print("SIGNED LIKE ME: \(Updater.signedLikeMe(URL(fileURLWithPath: args[i + 1])))")
      exit(0)
    }
    // `--test-install <zip url>`: run the real install steps against a local zip (no relaunch).
    if let i = args.firstIndex(of: "--test-install"), i + 1 < args.count, let url = URL(string: args[i + 1]) {
      Updater.shared.available = Updater.Release(version: "9.9.9", zip: url)
      Updater.shared.relaunchAfterInstall = false
      Updater.shared.install { error in
        let plist = NSDictionary(contentsOf: Bundle.main.bundleURL.appendingPathComponent("Contents/Info.plist"))
        let installed = plist?["CFBundleShortVersionString"] as? String ?? "?"
        print("INSTALL RESULT: \(error ?? "ok"); version on disk now: \(installed)")
        exit(0)
      }
      return true
    }
    if let i = args.firstIndex(of: "--selftest-review"), i + 1 < args.count {
      installTestHandler()
      reviewScenario(URL(fileURLWithPath: args[i + 1], isDirectory: true))
      return true
    }
    guard let index = args.firstIndex(of: "--selftest"), index + 1 < args.count else { return false }
    let out = URL(fileURLWithPath: args[index + 1], isDirectory: true)
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    installTestHandler()
    run(0, out)
    return true
  }

  private static func installTestHandler() {
    Store.shared.onChange = { Web.shared.broadcast(changes: $0) }
    Web.shared.handler = { action, body, viewId, reply in
      switch action {
      case "storage.get": reply(Store.shared.get(body["key"] as? String ?? ""))
      case "storage.set": Store.shared.set(body["items"] as? [String: Any] ?? [:]); reply(true)
      case "window.current": reply(viewId)
      case "window.find": reply([])
      case "shortcut.get": reply("⌃⌥B")
      case "shortcut.list": reply(HotKey.presets.map { ["id": $0.id, "label": $0.label] })
      case "app.info": reply(["version": Updater.currentVersion, "update": "", "launchAtLogin": false])
      case "perm.status": reply(Permissions.status())
      default: reply(true)
      }
    }
  }

  // MARK: review scenario (mocked Sheet + Gemini, separate storage)

  private static let mockNetwork = """
    (() => {
      const words = [
        { id: 'a', word: 'banana', meaning_vi: 'quả chuối', example_en: 'I eat a banana.', added_at: '2026-11-20T10:00:00Z', flagged: 'FALSE' },
        { id: 'b', word: 'look up', meaning_vi: 'tra cứu', example_en: 'Look up this word.', added_at: '2026-11-19T10:00:00Z', flagged: 'FALSE' },
        { id: 'c', word: 'cat', meaning_vi: 'con mèo', example_en: 'A cat sleeps.', added_at: '2026-11-18T10:00:00Z', flagged: 'FALSE' },
      ];
      window.__sheetCalls = [];
      const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const real = window.fetch.bind(window);
      window.fetch = async (url, init) => {
        const u = String(url);
        if (u.includes('script.google.com')) {
          const body = JSON.parse(init.body);
          window.__sheetCalls.push(body.action);
          if (body.action === 'list') return json({ ok: true, words });
          if (body.action === 'history-list') return json({ ok: true, days: [] });
          return json({ ok: true, updated: 1, day: {} });
        }
        if (u.includes('generativelanguage')) return json({ candidates: [{ content: { parts: [{ text: '{"heard":"x","score":10}' }] } }] });
        return real(url, init);
      };
    })();
    """

  private static func reviewScenario(_ out: URL) {
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    Store.shared.set([
      "settings": ["sheetUrl": "https://script.google.com/macros/s/test/exec", "token": "t", "apiKey": "k", "model": "gemini-3.1-flash-lite"],
      "session": NSNull(),
    ])
    let (_, view) = Web.shared.makeWebView()
    view.configuration.userContentController.addUserScript(WKUserScript(source: mockNetwork, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let window = NSWindow(contentRect: NSRect(x: -4000, y: 0, width: 1100, height: 780), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = view
    window.orderFrontRegardless()
    windows.append(window)
    view.load(URLRequest(url: WebRoot.url("review/review.html")))

    let state = """
      const visible = (id) => !document.getElementById(id).hidden;
      return JSON.stringify({
        counter: document.getElementById('counter').textContent,
        otherTabMessage: visible('screenMessage') ? document.getElementById('msgTitle').textContent : null,
        typing: visible('typingPart'), speaking: visible('speakingPart'),
        slots: [...document.querySelectorAll('#slots .slot')].map((s) => s.textContent || '_').join(''),
        sheetCalls: window.__sheetCalls,
      });
      """
    let steps = """
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const answers = { 'quả chuối': 'banana', 'tra cứu': 'lookup', 'con mèo': 'cat' };
      const input = document.getElementById('answerInput');
      const form = document.getElementById('answerForm');
      const type = (text) => { input.value = text; input.dispatchEvent(new Event('input')); form.requestSubmit(); };
      const answer = answers[document.getElementById('meaning').textContent];
      type('z'.repeat(answer.length));
      await sleep(1500);
      const afterWrong = document.getElementById('screenMessage').hidden ? 'none' : document.getElementById('msgTitle').textContent;
      type(answer);
      await sleep(2500);
      \(state.replacingOccurrences(of: "return JSON.stringify({", with: "return JSON.stringify({ afterWrongMessage: afterWrong,"))
      """
    func report(_ label: String, _ js: String, then next: @escaping () -> Void) {
      view.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
        switch result {
        case .success(let value): print("REVIEW \(label): \(value as? String ?? "?")")
        case .failure(let error): print("REVIEW \(label): error \(error)")
        }
        next()
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
      report("start", state) {
        report("after wrong then correct", steps) {
          view.reload()
          DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            report("after reload", state) {
              view.takeSnapshot(with: nil) { image, _ in
                if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                   let png = rep.representation(using: .png, properties: [:]) {
                  try? png.write(to: out.appendingPathComponent("review-after-reload.png"))
                }
                print("SELFTEST REVIEW DONE")
                exit(0)
              }
            }
          }
        }
      }
    }
  }

  private static func run(_ index: Int, _ out: URL) {
    guard index < pages.count else {
      print("SELFTEST DONE")
      exit(0)
    }
    let (name, path, size) = pages[index]
    let (_, view) = Web.shared.makeWebView()
    view.configuration.userContentController.addUserScript(WKUserScript(source: """
      window.__errors = [];
      window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
      window.addEventListener('unhandledrejection', (e) => window.__errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)));
      """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let window = NSWindow(contentRect: NSRect(origin: NSPoint(x: -4000, y: 0), size: size), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = view
    window.orderFrontRegardless()
    windows.append(window)
    view.load(URLRequest(url: WebRoot.url(path)))
    if name == "toast" {
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
        view.evaluateJavaScript("showToast('Saved look up - tra cứu', 'success', ''); document.getElementById('toast').style.animation = 'none'", completionHandler: nil)
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 4.5) {
      let probe = """
        JSON.stringify({ title: document.title, chrome: !!(window.chrome && window.chrome.storage), native: !!window.boNative,
          worker: !!window.boWorker, errors: window.__errors,
          text: (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 160) })
        """
      view.evaluateJavaScript(probe) { result, error in
        print("PAGE \(name): \(result as? String ?? "eval error \(String(describing: error))")")
        view.takeSnapshot(with: nil) { image, _ in
          if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
             let png = rep.representation(using: .png, properties: [:]) {
            try? png.write(to: out.appendingPathComponent("\(name).png"))
          }
          run(index + 1, out)
        }
      }
    }
  }
}
