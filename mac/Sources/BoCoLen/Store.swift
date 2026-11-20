import Foundation

/// The app's version of chrome.storage.local: one JSON file in Application Support (0600).
/// Every change is reported through `onChange` so all web views get chrome.storage.onChanged.
final class Store {
  static let shared = Store()

  private(set) var data: [String: Any] = [:]
  let fileURL: URL
  var onChange: (([String: Any]) -> Void)?

  init() {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    // BOCOLEN_STORE_DIR lets the self-test use its own file instead of the learner's data.
    let dir = ProcessInfo.processInfo.environment["BOCOLEN_STORE_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) }
      ?? base.appendingPathComponent("BoCoLen", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    fileURL = dir.appendingPathComponent("storage.json")
    if let raw = try? Data(contentsOf: fileURL),
       let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
      data = obj
    }
  }

  /// Same shape as chrome.storage.local.get(key): `{ key: value }`, or `{}` when missing.
  func get(_ key: String) -> [String: Any] {
    guard let value = data[key] else { return [:] }
    return [key: value]
  }

  func value(_ key: String) -> Any? { data[key] }

  func set(_ items: [String: Any]) {
    var changes: [String: Any] = [:]
    for (key, value) in items {
      var change: [String: Any] = ["newValue": value]
      if let old = data[key] { change["oldValue"] = old }
      changes[key] = change
      data[key] = value
    }
    persist()
    onChange?(changes)
  }

  private func persist() {
    guard JSONSerialization.isValidJSONObject(data),
          let raw = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]) else {
      NSLog("BoCoLen: storage holds a value that is not JSON; it was not saved")
      return
    }
    let tmp = fileURL.appendingPathExtension("tmp")
    do {
      try raw.write(to: tmp, options: .atomic)
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tmp.path)
      if FileManager.default.fileExists(atPath: fileURL.path) {
        _ = try FileManager.default.replaceItemAt(fileURL, withItemAt: tmp)
      } else {
        try FileManager.default.moveItem(at: tmp, to: fileURL)
      }
    } catch {
      NSLog("BoCoLen: could not save storage: \(error)")
    }
  }
}
