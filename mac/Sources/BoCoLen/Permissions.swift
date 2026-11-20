import AppKit
import ApplicationServices
import AVFoundation

/// The three macOS permissions the app needs, with their System Settings pages.
enum Permissions {
  static func accessibilityGranted(prompt: Bool = false) -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
  }

  static func screenGranted(prompt: Bool = false) -> Bool {
    if CGPreflightScreenCaptureAccess() { return true }
    if prompt { CGRequestScreenCaptureAccess() }
    return false
  }

  static func microphoneStatus() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: return "granted"
    case .notDetermined: return "ask"
    default: return "missing"
    }
  }

  static func status() -> [String: String] {
    [
      "accessibility": accessibilityGranted() ? "granted" : "missing",
      "screen": CGPreflightScreenCaptureAccess() ? "granted" : "missing",
      "microphone": microphoneStatus(),
    ]
  }

  static func request(_ kind: String) {
    let pane: String
    switch kind {
    case "accessibility":
      _ = accessibilityGranted(prompt: true)
      pane = "Privacy_Accessibility"
    case "screen":
      _ = screenGranted(prompt: true)
      pane = "Privacy_ScreenCapture"
    case "microphone":
      if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
        AVCaptureDevice.requestAccess(for: .audio) { _ in }
        return
      }
      pane = "Privacy_Microphone"
    default:
      return
    }
    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") {
      NSWorkspace.shared.open(url)
    }
  }
}
