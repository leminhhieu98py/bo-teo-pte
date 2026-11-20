import Foundation
import WebKit

/// Serves the bundled web files at bocolen://app/<path>, like chrome-extension:// URLs.
final class WebRoot: NSObject, WKURLSchemeHandler {
  static let scheme = "bocolen"
  let root: URL

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  static func url(_ path: String) -> URL {
    URL(string: "\(scheme)://app/\(path.hasPrefix("/") ? String(path.dropFirst()) : path)")!
  }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    let relative = url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
    let file = root.appendingPathComponent(relative).standardizedFileURL
    // Never serve anything outside the web folder.
    guard file.path.hasPrefix(root.path + "/"), let body = try? Data(contentsOf: file) else {
      task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
      task.didFinish()
      return
    }
    let headers = ["Content-Type": Self.mime(file.pathExtension), "Cache-Control": "no-store"]
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    task.didReceive(body)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

  static func mime(_ ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "png": return "image/png"
    case "svg": return "image/svg+xml"
    default: return "application/octet-stream"
    }
  }
}
