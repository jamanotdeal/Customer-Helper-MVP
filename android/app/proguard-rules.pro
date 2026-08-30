# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ─── Jamanot ──────────────────────────────────────────────────────────────────
# Release builds run minifyEnabled/shrinkResources, so anything reached only by
# reflection or by name from the WebView bridge has to be kept explicitly.

# Capacitor resolves plugins by their annotated name at runtime.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod public *; }

# Credential Manager / Google Identity read credential payloads reflectively.
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep class androidx.credentials.** { *; }

# Firestore maps documents onto fields by name.
-keepclassmembers class com.jamanot.app.core.** { *; }
-keepattributes Signature, *Annotation*, InnerClasses, EnclosingMethod

# Entry points started by the system, not by our own code.
-keep class com.jamanot.app.service.** { *; }
-keep class com.jamanot.app.receiver.** { *; }
-keep class com.jamanot.app.ui.** { *; }
-keep class com.jamanot.app.work.** { *; }
-keep class com.jamanot.app.JamanotApp { *; }

-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
