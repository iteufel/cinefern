import XCTest

/// Requires the local synthetic-media server and its installed/enabled fixture provider.
/// Uses the real signed app, native Keychain store, media relay and VLC decoder.
final class PlayerUITests: XCTestCase {
  @MainActor func testVLCTracksAndPausedRotation() throws {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "org.cinefern.native.ios")
    app.launchArguments = ["-cinefern.native.player", "vlc"]
    app.launch()
    let explore = app.buttons["Explore"]
    XCTAssertTrue(
      explore.waitForExistence(timeout: 15),
      "Install/enable the local media fixture before this test.")
    explore.tap()
    let play = app.buttons["Play"]
    for _ in 0..<4 where !play.isHittable { app.swipeUp() }
    XCTAssertTrue(play.isHittable)
    play.tap()
    let options = app.buttons["player.options"]
    XCTAssertTrue(options.waitForExistence(timeout: 15))
    options.tap()
    app.sliders["Position"].firstMatch.adjust(toNormalizedSliderPosition: 0.1)
    let source = app.buttons["VLC: two audio tracks + subtitles"]
    for _ in 0..<5 where !source.isHittable { app.swipeUp() }
    XCTAssertTrue(source.isHittable)
    source.tap()
    let german = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH 'player.audio.' AND label CONTAINS[c] 'German'")
    ).firstMatch
    let deutsch = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH 'player.audio.' AND label CONTAINS[c] 'Deutsch'")
    ).firstMatch
    let audio = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'player.audio.'"))
    for _ in 0..<8 where !audio.firstMatch.exists { app.swipeUp() }
    XCTAssertTrue(audio.firstMatch.waitForExistence(timeout: 15), "VLC tracks were not discovered.")
    XCTAssertEqual(audio.count, 2)
    let second = german.exists ? german : (deutsch.exists ? deutsch : audio.element(boundBy: 1))
    for _ in 0..<5 where !second.isHittable { app.swipeUp() }
    XCTAssertTrue(second.isHittable)
    second.tap()
    Thread.sleep(forTimeInterval: 0.7)
    XCTAssertTrue(NSPredicate(format: "value == 'selected'").evaluate(with: second))
    let subtitle = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH 'player.subtitle.' AND identifier != 'player.subtitle.off'")
    ).firstMatch
    for _ in 0..<6 where !subtitle.exists { app.swipeUp() }
    XCTAssertTrue(subtitle.waitForExistence(timeout: 10))
    for _ in 0..<4 where !subtitle.isHittable { app.swipeUp() }
    subtitle.tap()
    Thread.sleep(forTimeInterval: 0.7)
    XCTAssertTrue(NSPredicate(format: "value == 'selected'").evaluate(with: subtitle))
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "VLC audio and subtitle selection"
    attachment.lifetime = .keepAlways
    add(attachment)
    let off = app.buttons["player.subtitle.off"]
    off.tap()
    XCTAssertEqual(off.value as? String, "selected")
    let pause = app.buttons["player.toggle"]
    for _ in 0..<8 where !pause.isHittable { app.swipeDown() }
    let playing = expectation(for: NSPredicate(format: "value == 'playing'"), evaluatedWith: pause)
    wait(for: [playing], timeout: 15)
    XCTAssertEqual(pause.label, "Pause")
    pause.tap()
    let paused = expectation(for: NSPredicate(format: "value == 'paused'"), evaluatedWith: pause)
    wait(for: [paused], timeout: 5)
    Thread.sleep(forTimeInterval: 0.7)
    let position = app.staticTexts["player.position"]
    let seconds = { (text: String) in Int(text.split(separator: " ").first ?? "") ?? -100 }
    let before = position.label
    XCUIDevice.shared.orientation = .portrait
    XCUIDevice.shared.orientation = .landscapeRight
    Thread.sleep(forTimeInterval: 1.2)
    XCTAssertEqual(pause.value as? String, "paused", "VLC resumed during rotation.")
    XCTAssertLessThanOrEqual(
      abs(seconds(position.label) - seconds(before)), 1,
      "Paused clock moved beyond one displayed second.")
    let rotated = XCTAttachment(screenshot: app.screenshot())
    rotated.name = "VLC paused after Duo rotation"
    rotated.lifetime = .keepAlways
    add(rotated)
    app.buttons["Done"].tap()
  }
}
