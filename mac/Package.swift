// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "BoCoLen",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "BoCoLen",
      path: "Sources/BoCoLen",
      linkerSettings: [
        .linkedFramework("Carbon"),
        .linkedFramework("WebKit"),
        .linkedFramework("ServiceManagement"),
        .linkedFramework("AVFoundation"),
      ]
    ),
  ]
)
