# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# react-native-config reads BuildConfig by reflection (package = namespace).
-keep class com.rntempo.app.BuildConfig { *; }

# react-native-reanimated / react-native-worklets (their own proguard-rules.pro; repeated here for safety)
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }

# react-native-svg
-keep public class com.horcrux.svg.** { *; }

# @d11/react-native-fast-image (Glide)
-keep public class com.dylanvann.fastimage.* { *; }
-keep public class com.dylanvann.fastimage.** { *; }
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}

# react-native-mmkv 4 / nitro-modules, react-native-keychain, ssl pinning, jail-monkey: no keep rules needed
# (Nitro classes carry @DoNotStrip; the others document no ProGuard setup).
