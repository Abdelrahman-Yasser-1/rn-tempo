import UIKit
// @tempo-feature:push-notifications:start
import FirebaseCore
// @tempo-feature:push-notifications:end

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // @tempo-feature:push-notifications:start
    // The Firebase config file is per project and not in the repository. Without
    // GoogleService-Info.plist in the app bundle the app runs and push stays off.
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      FirebaseApp.configure()
    }
    // @tempo-feature:push-notifications:end
    return true
  }
}
