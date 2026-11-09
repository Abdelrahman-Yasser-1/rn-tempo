import UIKit
// @tempo-feature:firebase-core:start
import FirebaseCore
// @tempo-feature:firebase-core:end

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // @tempo-feature:firebase-core:start
    // The Firebase config file is per environment (firebase/<env>/) and a build phase copies it into the
    // bundle only when that environment has FIREBASE_ENABLED=true. Without GoogleService-Info.plist in the
    // app bundle the app runs and nothing initialises Firebase.
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      FirebaseApp.configure()
    }
    // @tempo-feature:firebase-core:end
    return true
  }
}
