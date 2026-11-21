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
    // `--hotkey-check`: which front apps turn the default Command+B on.
    if args.contains("--hotkey-check") {
      let preset = HotKey.presets[0]
      for app in ["com.google.Chrome", "com.apple.Safari", "company.thebrowser.Browser", "com.apple.Notes", "com.microsoft.Word", "com.tinyspeck.slackmacgap", "io.github.leminhhieu98py.bocolen"] {
        print("HOTKEY \(preset.id) in \(app): \(HotKey.shouldBeActive(preset, frontBundleId: app) ? "on" : "off")")
      }
      print("HOTKEY default label: \(preset.label)")
      exit(0)
    }
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
    if let i = args.firstIndex(of: "--selftest-learner"), i + 1 < args.count {
      installTestHandler()
      learnerScenario(URL(fileURLWithPath: args[i + 1], isDirectory: true))
      return true
    }
    if let i = args.firstIndex(of: "--selftest-nav"), i + 1 < args.count {
      installTestHandler()
      navScenario(URL(fileURLWithPath: args[i + 1], isDirectory: true))
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
      case "shortcut.get": reply("⌘B")
      case "shortcut.list": reply(HotKey.presets.map { ["id": $0.id, "label": $0.label] })
      case "app.info": reply(["version": Updater.currentVersion, "update": "", "launchAtLogin": false])
      case "perm.status": reply(Permissions.status())
      default: reply(true)
      }
    }
  }

  // MARK: learner scenario (Settings > Learner with a mocked Sheet)

  private static func learnerScenario(_ out: URL) {
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    Store.shared.set(["settings": ["sheetUrl": "https://script.google.com/macros/s/test/exec", "token": "t", "apiKey": "k", "model": "m"]])
    let (_, view) = Web.shared.makeWebView()
    view.configuration.userContentController.addUserScript(WKUserScript(source: """
      (() => {
        const users = [{ id: 'bo_k3x9q2mf', name: 'Bo' }];
        window.__calls = [];
        const json = (o) => new Response(JSON.stringify(o), { status: 200 });
        const real = window.fetch.bind(window);
        window.fetch = async (url, init) => {
          if (!String(url).includes('script.google.com')) return real(url, init);
          const b = JSON.parse(init.body);
          window.__calls.push(b.action + (b.id ? ':' + b.id : '') + (b.name ? ':' + b.name : ''));
          if (b.action === 'users-list') return json({ ok: true, users });
          if (b.action === 'users-create') { const u = { id: b.id, name: b.name }; users.push(u); return json({ ok: true, user: u, claimed: 0 }); }
          if (b.action === 'users-rename') { const u = users.find((x) => x.id === b.id); u.name = b.name; return json({ ok: true, user: u }); }
          return json({ ok: true, words: [] });
        };
      })();
      """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let window = NSWindow(contentRect: NSRect(x: -4000, y: 0, width: 720, height: 1700), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = view
    window.orderFrontRegardless()
    windows.append(window)
    view.load(URLRequest(url: WebRoot.url("options/options.html")))
    let steps = """
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const $ = (id) => document.getElementById(id);
      const settings = async () => (await window.chrome.storage.local.get('settings')).settings;
      const out = { options: [...$('learnerSelect').options].map((o) => o.text) };
      $('learnerSelect').value = ''; $('learnerSelect').dispatchEvent(new Event('change'));
      $('learnerName').value = 'Bé Ánh';
      $('learnerSave').click(); await sleep(1500);
      const s1 = await settings();
      out.afterCreate = { status: $('learnerStatus').textContent, userId: s1.userId, userName: s1.userName, idText: $('learnerIdText').textContent };
      $('learnerSelect').value = 'bo_k3x9q2mf'; $('learnerSelect').dispatchEvent(new Event('change'));
      $('learnerName').value = 'Bo Bo';
      $('learnerSave').click(); await sleep(1500);
      const s2 = await settings();
      out.afterSwitchRename = { status: $('learnerStatus').textContent, userId: s2.userId, userName: s2.userName };
      out.calls = window.__calls;
      return JSON.stringify(out);
      """
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
      view.callAsyncJavaScript(steps, arguments: [:], in: nil, in: .page) { result in
        switch result {
        case .success(let value): print("LEARNER \(value as? String ?? "?")")
        case .failure(let error): print("LEARNER error \(error)")
        }
        view.evaluateJavaScript("document.getElementById('learnerCard').scrollIntoView()") { _, _ in
          view.takeSnapshot(with: nil) { image, _ in
            if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let png = rep.representation(using: .png, properties: [:]) {
              try? png.write(to: out.appendingPathComponent("learner.png"))
            }
            print("SELFTEST LEARNER DONE")
            exit(0)
          }
        }
      }
    }
  }

  // MARK: nav scenario (one window; "Leave practice?" before another page)

  private static func navScenario(_ out: URL) {
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    seedPractice()
    Web.shared.extraScripts = [WKUserScript(source: mockNetwork, injectionTime: .atDocumentStart, forMainFrameOnly: true)]
    let id = Web.shared.open(WebRoot.url("review/review.html"))
    guard let view = Web.shared.views[id] else {
      print("NAV no web view")
      exit(1)
    }
    let probe = """
      const card = document.getElementById('screenCard');
      return JSON.stringify({
        page: location.pathname,
        rail: [...document.querySelectorAll('.nav-rail .nav-btn')].map((b) => b.getAttribute('aria-label') + (b.classList.contains('active') ? '*' : '')).join(','),
        leavePopup: Boolean(document.querySelector('.leave-overlay')),
        popupOpacity: document.querySelector('.leave-overlay') ? getComputedStyle(document.querySelector('.leave-overlay')).opacity + '/' + getComputedStyle(document.querySelector('.leave-card')).opacity : null,
        card: card ? !card.hidden : null,
        pageWindows: window.__pageWindows,
      });
      """
    let pageWindows = { NSApp.windows.filter { $0.isVisible && $0.contentView is WKWebView }.count }
    func step(_ label: String, before: String = "", wait: Double, then next: @escaping () -> Void) {
      view.callAsyncJavaScript("window.__pageWindows = \(pageWindows()); \(before)\n\(probe)", arguments: [:], in: nil, in: .page) { result in
        switch result {
        case .success(let value): print("NAV \(label): \(value as? String ?? "?")")
        case .failure(let error): print("NAV \(label): error \(error)")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + wait, execute: next)
      }
    }
    func snapshot(_ name: String, then next: @escaping () -> Void) {
      view.takeSnapshot(with: nil) { image, _ in
        if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
          try? png.write(to: out.appendingPathComponent(name))
        }
        next()
      }
    }
    let history = WebRoot.url("history/history.html")
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
      step("practice", wait: 0) {
        Web.shared.open(history)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
          step("asked for history", wait: 0) {
            snapshot("nav-leave-popup.png") {
              step("after Keep practicing", before: "document.querySelector('[data-answer=stay]').click(); await new Promise((r) => setTimeout(r, 300));", wait: 0) {
                Web.shared.open(history)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                  view.evaluateJavaScript("document.querySelector('[data-answer=leave]').click()") { _, _ in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                      step("after Leave", wait: 0) {
                        snapshot("nav-history.png") {
                          Web.shared.open(WebRoot.url("options/options.html"))
                          DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            step("settings without asking", wait: 0) {
                              print("SELFTEST NAV DONE")
                              exit(0)
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
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
      window.__xp = 2000;
      window.__earned = 0;
      const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const real = window.fetch.bind(window);
      window.fetch = async (url, init) => {
        const u = String(url);
        if (u.includes('script.google.com')) {
          const body = JSON.parse(init.body);
          window.__sheetCalls.push(body.action);
          if (body.action === 'list') return json({ ok: true, words });
          if (body.action === 'history-list') return json({ ok: true, days: [] });
          if (body.action === 'wallet-get') return json({ ok: true, xp: window.__xp, earnedToday: window.__earned, owned: [], pet: '', theme: '' });
          if (body.action === 'wallet-earn') {
            const credited = Math.min(body.amount, 200 - window.__earned);
            window.__xp += credited; window.__earned += credited;
            return json({ ok: true, credited, xp: window.__xp, earnedToday: window.__earned });
          }
          if (body.action === 'wallet-spend') { window.__xp -= body.amount; return json({ ok: true, xp: window.__xp }); }
          return json({ ok: true, updated: 1, day: {} });
        }
        if (u.includes('generativelanguage')) return json({ candidates: [{ content: { parts: [{ text: '{"heard":"x","score":10}' }] } }] });
        return real(url, init);
      };
    })();
    """

  private static func seedPractice() {
    Store.shared.set([
      "settings": ["sheetUrl": "https://script.google.com/macros/s/test/exec", "token": "t", "apiKey": "k", "model": "gemini-3.1-flash-lite",
                   "userId": "bo_k3x9q2mf", "userName": "Bo"],
      "session": NSNull(),
    ])
  }

  private static func reviewScenario(_ out: URL) {
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    seedPractice()
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
        wallet: document.getElementById('xpPill').textContent,
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
      type(answer.slice(document.querySelectorAll('#slots .slot.hint').length));
      await sleep(2500);
      \(state.replacingOccurrences(of: "return JSON.stringify({", with: "return JSON.stringify({ afterWrongMessage: afterWrong,"))
      """
    // Arrow keys cannot be pressed from JS, so the caret is moved the same way they move it.
    let caret = """
      const input = document.getElementById('answerInput');
      const blink = () => [...document.querySelectorAll('#slots .slot')].findIndex((s) => s.classList.contains('cursor'));
      const letters = () => [...document.querySelectorAll('#slots .slot')].map((s) => s.textContent || '_').join('');
      input.focus();
      input.value = 'ct';
      input.dispatchEvent(new Event('input'));
      const typedEnd = blink();
      input.setSelectionRange(1, 1);
      input.dispatchEvent(new Event('keyup'));
      const afterLeft = blink();
      input.setRangeText('a', 1, 1, 'end');
      input.dispatchEvent(new Event('input'));
      const afterInsert = { slots: letters(), blink: blink() };
      document.querySelector('#slots .slot').click();
      const afterClickFirst = blink();
      input.value = '';
      input.dispatchEvent(new Event('input'));
      const walletBefore = document.getElementById('xpPill').textContent;
      document.getElementById('hintBtn').click();
      await new Promise((r) => setTimeout(r, 1500));
      const walletAfterHint = document.getElementById('xpPill').textContent;
      return JSON.stringify({ typedEnd, afterLeft, afterInsert, afterClickFirst, walletBefore, walletAfterHint, calls: window.__sheetCalls });
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
       report("caret", caret) {
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
    if name == "history" {
      // Show the loading state: settings exist and the Sheet answers slowly.
      Store.shared.set(["settings": ["sheetUrl": "https://script.google.com/macros/s/test/exec", "token": "t", "apiKey": "k", "model": "m"]])
      view.configuration.userContentController.addUserScript(WKUserScript(source: """
        const realFetch = window.fetch.bind(window);
        window.fetch = (url, init) => String(url).includes('script.google.com')
          ? new Promise((resolve) => setTimeout(() => resolve(new Response('{"ok":true,"days":[]}')), 20000))
          : realFetch(url, init);
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
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
