import AppKit
import Security

/// Updates the app from the GitHub Releases of the public repo. A downloaded app replaces the
/// running one only if it is signed by the same identity (same designated requirement).
final class Updater {
  static let shared = Updater()
  static let repo = "leminhhieu98py/bo-teo-pte"
  static var currentVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
  }

  struct Release { let version: String; let zip: URL }
  var available: Release?
  var relaunchAfterInstall = true
  private var timer: Timer?

  func start() {
    check(completion: nil)
    timer = Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { [weak self] _ in self?.check(completion: nil) }
  }

  /// Completion gets "available", "latest" or an error text.
  func check(completion: ((String) -> Void)?) {
    var request = URLRequest(url: URL(string: "https://api.github.com/repos/\(Self.repo)/releases/latest")!)
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
    request.setValue("BoCoLen/\(Self.currentVersion)", forHTTPHeaderField: "User-Agent")
    request.timeoutInterval = 30
    URLSession.shared.dataTask(with: request) { data, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      var result = "Could not check for updates (\(error?.localizedDescription ?? "HTTP \(status)"))"
      if status == 404 {
        result = "No release published yet."
      } else if let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let tag = json["tag_name"] as? String {
        let version = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        let assets = json["assets"] as? [[String: Any]] ?? []
        let zip = assets.first { ($0["name"] as? String ?? "").hasSuffix(".zip") }?["browser_download_url"] as? String
        if Self.isNewer(version, than: Self.currentVersion), let zip, let url = URL(string: zip) {
          self.available = Release(version: version, zip: url)
          result = "available"
          DispatchQueue.main.async { Store.shared.set(["update": ["version": version]]) }
        } else {
          self.available = nil
          result = "latest"
          DispatchQueue.main.async { Store.shared.set(["update": ["version": ""]]) }
        }
      }
      DispatchQueue.main.async { completion?(result) }
    }.resume()
  }

  static func isNewer(_ a: String, than b: String) -> Bool {
    let pa = a.split(separator: ".").map { Int($0) ?? 0 }
    let pb = b.split(separator: ".").map { Int($0) ?? 0 }
    for i in 0..<max(pa.count, pb.count) {
      let x = i < pa.count ? pa[i] : 0
      let y = i < pb.count ? pb[i] : 0
      if x != y { return x > y }
    }
    return false
  }

  /// Downloads, verifies, replaces the app and relaunches. Completion gets an error text or nil.
  func install(completion: @escaping (String?) -> Void) {
    guard let release = available else { return completion("No update available.") }
    let fail: (String) -> Void = { message in DispatchQueue.main.async { completion(message) } }
    URLSession.shared.downloadTask(with: release.zip) { file, _, error in
      guard let file else { return fail("Download failed: \(error?.localizedDescription ?? "unknown error")") }
      let work = FileManager.default.temporaryDirectory.appendingPathComponent("bocolen-update-\(UUID().uuidString)")
      do {
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        let zip = work.appendingPathComponent("update.zip")
        try FileManager.default.moveItem(at: file, to: zip)
        try Self.run("/usr/bin/ditto", ["-x", "-k", zip.path, work.path])
        guard let newApp = try FileManager.default.contentsOfDirectory(at: work, includingPropertiesForKeys: nil)
          .first(where: { $0.pathExtension == "app" }) else { return fail("The update has no app inside.") }
        guard Self.signedLikeMe(newApp) else {
          return fail("This update is not signed by the Bo cố lên publisher, so it was not installed.")
        }
        let current = Bundle.main.bundleURL
        _ = try FileManager.default.replaceItemAt(current, withItemAt: newApp)
        DispatchQueue.main.async {
          completion(nil)
          if self.relaunchAfterInstall { Self.relaunch(current) }
        }
      } catch {
        fail("Could not install the update: \(error.localizedDescription). Move Bo cố lên to the Applications folder and try again.")
      }
    }.resume()
  }

  static func signedLikeMe(_ app: URL) -> Bool {
    var me: SecCode?
    var myStatic: SecStaticCode?
    var requirement: SecRequirement?
    var other: SecStaticCode?
    guard SecCodeCopySelf([], &me) == errSecSuccess, let me,
          SecCodeCopyStaticCode(me, [], &myStatic) == errSecSuccess, let myStatic,
          SecCodeCopyDesignatedRequirement(myStatic, [], &requirement) == errSecSuccess, let requirement,
          SecStaticCodeCreateWithPath(app as CFURL, [], &other) == errSecSuccess, let other else { return false }
    return SecStaticCodeCheckValidity(other, SecCSFlags(rawValue: kSecCSCheckAllArchitectures), requirement) == errSecSuccess
  }

  private static func run(_ tool: String, _ args: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: tool)
    process.arguments = args
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
      throw NSError(domain: "BoCoLen", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: "\(tool) failed"])
    }
  }

  private static func relaunch(_ app: URL) {
    let script = Process()
    script.executableURL = URL(fileURLWithPath: "/bin/sh")
    script.arguments = ["-c", "sleep 1; /usr/bin/open \"$0\"", app.path]
    try? script.run()
    NSApp.terminate(nil)
  }
}
