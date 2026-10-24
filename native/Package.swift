// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "CinefernNative",
    platforms: [.macOS(.v14), .iOS(.v17), .tvOS(.v17)],
    products: [.library(name: "CinefernCore", targets: ["CinefernCore"])],
    targets: [
        .target(name: "CinefernCore", path: "Sources/Core", resources: [.copy("Resources/runtime.js"), .copy("Resources/runtime.js.LEGAL.txt")]),
        .testTarget(name: "CinefernCoreTests", dependencies: ["CinefernCore"], path: "Tests/CoreTests", resources: [.copy("Fixtures")]),
    ]
)
