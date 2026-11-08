package com.rntempo.app

import android.app.Application
import android.app.NotificationChannel // @tempo-feature:push-notifications
import android.app.NotificationManager // @tempo-feature:push-notifications
import android.os.Build // @tempo-feature:push-notifications
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannels() // @tempo-feature:push-notifications
  }

  // @tempo-feature:push-notifications:start
  // Android 8+ shows a notification only in a channel. FCM uses the "default" one (named in the manifest)
  // for notifications it displays while the app is closed. Creating an existing channel changes nothing,
  // so this runs on every start; the name is in res/values/strings.xml and values-ar/strings.xml.
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        "default",
        getString(R.string.push_channel_default),
        NotificationManager.IMPORTANCE_DEFAULT,
      ),
    )
  }
  // @tempo-feature:push-notifications:end
}
