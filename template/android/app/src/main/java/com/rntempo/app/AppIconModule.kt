package com.rntempo.app

import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class AppIconModule(private val context: ReactApplicationContext) : NativeAppIconSpec(context) {
  private val aliases = listOf("Default", "Ocean", "Forest", "Sunset").associateWith {
    ComponentName(context.packageName, "${context.packageName}.Launcher$it")
  }

  override fun isSupported() = true

  private fun enabledAliases() = aliases.filter { (name, component) ->
    when (context.packageManager.getComponentEnabledSetting(component)) {
      PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> name == "Default"
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      else -> false
    }
  }

  @Synchronized
  override fun getIcon(promise: Promise) {
    try {
      promise.resolve(enabledAliases().keys.single().takeUnless { it == "Default" })
    } catch (error: RuntimeException) {
      promise.reject("E_APP_ICON", error)
    }
  }

  @Synchronized
  override fun setIcon(name: String?, promise: Promise) {
    val selected = name ?: "Default"
    try {
      require(selected in aliases) { "Unknown launcher icon" }
      val manager = context.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val settings = aliases.map { (alias, component) ->
          val state = if (alias == selected) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
          } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
          }
          PackageManager.ComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP)
        }
        manager.setComponentEnabledSettings(settings)
      } else {
        val enabled = enabledAliases()
        // Enable first so the launcher always has an entry between the two updates.
        if (selected !in enabled) {
          manager.setComponentEnabledSetting(
            aliases.getValue(selected),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
          )
        }
        for ((alias, component) in enabled) {
          if (alias != selected) {
            manager.setComponentEnabledSetting(
              component,
              PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
              PackageManager.DONT_KILL_APP,
            )
          }
        }
      }
      promise.resolve(null)
    } catch (error: RuntimeException) {
      promise.reject("E_APP_ICON", error)
    }
  }
}
