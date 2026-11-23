package com.rntempo.app

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class AppIconPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext) =
    if (name == NativeAppIconSpec.NAME) AppIconModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    val name = NativeAppIconSpec.NAME
    mapOf(name to ReactModuleInfo(name, AppIconModule::class.java.name, false, false, false, true))
  }
}
