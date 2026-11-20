import AppKit

// Bo co len for macOS: a Dock + menu bar app that shows the same web pages as the Chrome
// extension (served from the app bundle) and saves words with a global shortcut.
let app = NSApplication.shared
let controller = AppController()
app.delegate = controller
app.setActivationPolicy(.regular)
app.run()
