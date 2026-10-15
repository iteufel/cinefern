import AVKit
import ExpoModulesCore

struct PlayerMenuOption: Record {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var selected: Bool = false
  @Field var disabled: Bool = false
}
struct PlayerMenuGroup: Record {
  @Field var title: String = ""
  @Field var symbol: String = ""
  @Field var options: [PlayerMenuOption] = []
}

public final class CinefernPlayerMenusModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CinefernPlayerMenus")
    View(CinefernPlayerMenusView.self) {
      Events("onSelect", "onReady")
      Prop("groups") { (view, groups: [PlayerMenuGroup]) in
        view.groups = groups
        view.updateMenus()
      }
      Prop("caption") { (view, caption: String?) in view.setCaption(caption ?? "") }
      Prop("problem") { (view, problem: String?) in view.showProblem(problem ?? "") }
    }
  }
}

final class CinefernPlayerMenusView: ExpoView {
  let onSelect = EventDispatcher()
  let onReady = EventDispatcher()
  var groups: [PlayerMenuGroup] = []
  private let menuButton = UIButton(type: .system)
  private let captionLabel = UILabel()
  private weak var controller: AVPlayerViewController?
  private var attachment: DispatchWorkItem?
  private var attempts = 0
  private var lastProblem = ""

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    #if !os(tvOS)
    menuButton.setImage(UIImage(systemName: "ellipsis"), for: .normal)
    menuButton.tintColor = .white
    menuButton.accessibilityLabel = "Audio, subtitles and playback options"
    menuButton.showsMenuAsPrimaryAction = true
    addSubview(menuButton)
    #endif
    captionLabel.textColor = .white
    captionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.75)
    captionLabel.textAlignment = .center
    captionLabel.numberOfLines = 0
    captionLabel.font = .preferredFont(forTextStyle: .title2)
    captionLabel.adjustsFontForContentSizeCategory = true
    captionLabel.layer.cornerRadius = 8
    captionLabel.clipsToBounds = true
    captionLabel.isHidden = true
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    menuButton.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attachment?.cancel()
    // Fullscreen presentation can detach the presenting React view from its
    // window. Keep the menus attached until the bridge is actually released.
    guard window != nil else { return }
    #if os(tvOS)
    attempts = 0
    attachToPlayer()
    #else
    onReady()
    #endif
  }

  deinit {
    attachment?.cancel()
    let playerController = controller
    let label = captionLabel
    DispatchQueue.main.async {
      label.removeFromSuperview()
      #if os(tvOS)
      playerController?.transportBarCustomMenuItems = []
      if let playerController, playerController.presentingViewController != nil, !playerController.isBeingDismissed {
        playerController.player?.pause()
        playerController.dismiss(animated: false)
      }
      #endif
    }
  }

  // Use UIKit's public responder chain. No dependency on expo-video internals,
  // private selectors, or a second AVPlayer that could desynchronise playback.
  private func findPlayer(in view: UIView) -> AVPlayerViewController? {
    if let player = view.next as? AVPlayerViewController { return player }
    for child in view.subviews {
      if let player = findPlayer(in: child) { return player }
    }
    return nil
  }

  private func attachToPlayer() {
    guard window != nil, controller == nil else { return }
    // Fabric wraps Expo views in host views. Search the nearest common ancestor
    // with VideoView, rather than assuming the bridge's direct parent owns it.
    var ancestor = superview
    var found: AVPlayerViewController?
    while let candidate = ancestor, !(candidate is UIWindow) {
      if let player = findPlayer(in: candidate) { found = player; break }
      ancestor = candidate.superview
    }
    if let player = found {
      controller = player
      updateMenus()
      if let overlay = player.contentOverlayView {
        overlay.addSubview(captionLabel)
        captionLabel.translatesAutoresizingMaskIntoConstraints = false
        #if os(tvOS)
        let bottom = player.unobscuredContentGuide.bottomAnchor
        #else
        let bottom = overlay.safeAreaLayoutGuide.bottomAnchor
        #endif
        NSLayoutConstraint.activate([
          captionLabel.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
          captionLabel.widthAnchor.constraint(lessThanOrEqualTo: overlay.widthAnchor, multiplier: 0.8),
          captionLabel.bottomAnchor.constraint(equalTo: bottom, constant: -54)
        ])
      }
      onReady()
      return
    }
    attempts += 1
    guard attempts < 40 else { return }
    let work = DispatchWorkItem { [weak self] in self?.attachToPlayer() }
    attachment = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: work)
  }

  func updateMenus() {
    let menus = groups.filter { !$0.options.isEmpty }.map { group -> UIMenu in
      let actions = group.options.map { option in
        UIAction(title: option.label,
                 attributes: option.disabled ? [.disabled] : [],
                 state: option.selected ? .on : .off) { [weak self] _ in
          self?.onSelect(["id": option.id])
        }
      }
      return UIMenu(title: group.title, image: UIImage(systemName: group.symbol), children: actions)
    }
    #if os(tvOS)
    controller?.transportBarCustomMenuItems = menus
    #else
    menuButton.menu = UIMenu(children: menus)
    #endif
  }

  func setCaption(_ text: String) {
    captionLabel.text = text.isEmpty ? nil : "  \(text)  "
    captionLabel.isHidden = text.isEmpty
  }

  func showProblem(_ problem: String) {
    guard !problem.isEmpty, problem != lastProblem else {
      if problem.isEmpty { lastProblem = "" }
      return
    }
    #if os(tvOS)
    guard let controller, controller.view.window != nil else { return }
    lastProblem = problem
    let alert = UIAlertController(title: "Playback", message: problem, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .cancel))
    controller.present(alert, animated: true)
    #endif
  }
}
