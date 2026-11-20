import AppKit
import ServiceManagement
import WebKit

/// Wires everything together: menu bar icon + popover, Dock, main menu, the bridge actions used
/// by the web pages, the global shortcut and the self-updater.
final class AppController: NSObject, NSApplicationDelegate {
  private let web = Web.shared
  private let store = Store.shared
  private var statusItem: NSStatusItem!
  private let popover = NSPopover()
  private var popoverId = 0
  private let saver = Saver()

  func applicationDidFinishLaunching(_ notification: Notification) {
    if SelfTest.runIfRequested() { return }

    // Only one copy may run: two copies would overwrite each other's storage file.
    let me = ProcessInfo.processInfo.processIdentifier
    if let other = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "")
      .first(where: { $0.processIdentifier != me }) {
      other.activate()
      NSApp.terminate(nil)
      return
    }

    store.onChange = { [weak self] changes in self?.web.broadcast(changes: changes) }
    web.handler = { [weak self] action, body, viewId, reply in self?.handle(action, body, viewId, reply) }
    web.onWindowOpened = { [weak self] in self?.popover.performClose(nil) }

    MainMenu.install(target: self)
    setUpStatusItem()
    saver.start()
    setUpLoginItemOnce()
    Updater.shared.start()

    // First run: no settings yet -> show Settings, otherwise the review.
    if (store.value("settings") as? [String: Any])?["apiKey"] as? String == nil {
      web.open(page: "options/options.html")
    }
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag { web.open(page: "review/review.html") }
    return true
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  // MARK: menu bar

  private func setUpStatusItem() {
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    if let image = NSImage(contentsOf: web.webRoot.appendingPathComponent("icons/icon32.png")) {
      image.size = NSSize(width: 20, height: 20)
      statusItem.button?.image = image
    }
    statusItem.button?.toolTip = "Bo cố lên"
    statusItem.button?.target = self
    statusItem.button?.action = #selector(togglePopover)

    let (id, view) = web.makeWebView()
    popoverId = id
    view.load(URLRequest(url: WebRoot.url("popup/popup.html")))
    let holder = NSViewController()
    holder.view = view
    popover.contentViewController = holder
    popover.contentSize = NSSize(width: 340, height: 520)
    popover.behavior = .transient
  }

  @objc func togglePopover() {
    guard let button = statusItem.button else { return }
    if popover.isShown {
      popover.performClose(nil)
    } else {
      web.views[popoverId]?.reload() // fresh streak / progress
      popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
      NSApp.activate(ignoringOtherApps: true)
    }
  }

  @objc func openReview() { web.open(page: "review/review.html") }
  @objc func openHistory() { web.open(page: "history/history.html") }
  @objc func openSettings() { web.open(page: "options/options.html") }
  @objc func saveWordNow() { saver.saveFromShortcut() }

  // MARK: login item

  private func setUpLoginItemOnce() {
    var prefs = store.value("appPrefs") as? [String: Any] ?? [:]
    // Only for an installed copy: a test build elsewhere must not become a login item.
    guard prefs["loginItemSet"] == nil, Bundle.main.bundlePath.contains("/Applications/") else { return }
    try? SMAppService.mainApp.register()
    prefs["loginItemSet"] = true
    store.set(["appPrefs": prefs])
  }

  // MARK: bridge actions (see native/chrome-shim.js)

  private func handle(_ action: String, _ body: [String: Any], _ viewId: Int, _ reply: @escaping (Any?) -> Void) {
    switch action {
    case "storage.get":
      reply(store.get(body["key"] as? String ?? ""))
    case "storage.set":
      store.set(body["items"] as? [String: Any] ?? [:])
      reply(true)
    case "window.open":
      if let page = body["page"] as? String {
        web.open(page: page)
      } else if let raw = body["url"] as? String, let url = URL(string: raw), url.scheme == WebRoot.scheme {
        web.open(url)
      }
      reply(true)
    case "window.find":
      reply(web.find(urls: body["urls"] as? [String] ?? []))
    case "window.current":
      reply(viewId)
    case "window.close":
      if let id = body["id"] as? Int { web.close(id) }
      reply(true)
    case "window.focus":
      if let id = body["id"] as? Int { web.focus(id) }
      reply(true)
    case "settings.shortcut":
      web.open(WebRoot.url("options/options.html#shortcut"))
      reply(true)
    case "shortcut.get":
      reply(saver.hotKey.current.label)
    case "shortcut.list":
      reply(HotKey.presets.map { ["id": $0.id, "label": $0.label] })
    case "shortcut.set":
      let ok = saver.setShortcut(body["id"] as? String ?? "")
      reply(["ok": ok, "label": saver.hotKey.current.label, "id": saver.hotKey.current.id])
    case "app.info":
      reply([
        "version": Updater.currentVersion,
        "update": Updater.shared.available?.version ?? "",
        "launchAtLogin": SMAppService.mainApp.status == .enabled,
      ])
    case "login.set":
      let on = body["on"] as? Bool ?? false
      if on { try? SMAppService.mainApp.register() } else { try? SMAppService.mainApp.unregister() }
      reply(SMAppService.mainApp.status == .enabled)
    case "perm.status":
      reply(Permissions.status())
    case "perm.request":
      Permissions.request(body["kind"] as? String ?? "")
      reply(true)
    case "update.check":
      Updater.shared.check { status in reply(status) }
    case "update.install":
      Updater.shared.install { error in reply(error ?? "ok") }
    default:
      reply(nil)
    }
  }
}

/// App, Edit and Window menus. The Edit menu makes Cmd+C / Cmd+V work in the Settings fields.
enum MainMenu {
  static func install(target: AppController) {
    let main = NSMenu()

    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "Start review", action: #selector(AppController.openReview), keyEquivalent: "r").target = target
    appMenu.addItem(withTitle: "History", action: #selector(AppController.openHistory), keyEquivalent: "y").target = target
    appMenu.addItem(withTitle: "Settings…", action: #selector(AppController.openSettings), keyEquivalent: ",").target = target
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide Bo cố lên", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit Bo cố lên", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    main.addItem(appItem)

    let editItem = NSMenuItem()
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(.separator())
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    main.addItem(editItem)

    let windowItem = NSMenuItem()
    let window = NSMenu(title: "Window")
    window.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowItem.submenu = window
    main.addItem(windowItem)

    NSApp.mainMenu = main
  }
}
