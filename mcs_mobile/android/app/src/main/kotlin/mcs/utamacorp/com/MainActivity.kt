package mcs.utamacorp.com

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import me.leolin.shortcutbadger.ShortcutBadger

class MainActivity : FlutterActivity() {
    private val badgeChannel = "mcs.utamacorp.com/app_badge"
    private val preventiveAlarmEffectChannel = "mcs.utamacorp.com/preventive_alarm_effect"
    private var preventiveAlarmPlayer: MediaPlayer? = null
    private var preventiveAlarmVibrator: Vibrator? = null
    private var preventiveAlarmAudioFocusRequest: AudioFocusRequest? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, badgeChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "setBadgeCount" -> {
                        val count = call.argument<Int>("count")?.coerceAtLeast(0) ?: 0
                        applyLauncherBadge(count)
                        result.success(null)
                    }
                    "openPreventiveAlarmPermissionSettings" -> {
                        result.success(openPreventiveAlarmPermissionSettings())
                    }
                    "openExactAlarmPermissionSettings" -> {
                        result.success(openExactAlarmPermissionSettings())
                    }
                    "openOverlayPermissionSettings" -> {
                        result.success(openOverlayPermissionSettings())
                    }
                    "getPreventiveAlarmPermissionState" -> {
                        result.success(preventiveAlarmPermissionState())
                    }
                    else -> result.notImplemented()
                }
            }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, preventiveAlarmEffectChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openPreventiveAlarmPermissionSettings" -> {
                        result.success(openPreventiveAlarmPermissionSettings())
                    }
                    "startPreventiveAlarm" -> {
                        startPreventiveAlarmEffect(call.argument<String>("soundUrl").orEmpty())
                        result.success(null)
                    }
                    "stopPreventiveAlarm" -> {
                        stopPreventiveAlarmEffect()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun startPreventiveAlarmEffect(@Suppress("UNUSED_PARAMETER") soundUrl: String) {
        stopPreventiveAlarmEffect()
        requestPreventiveAlarmAudioFocus()
        // The alarm tone is packaged in the APK so it remains reliable while
        // the app is closed and never depends on a web download.
        startBundledPreventiveAlarm()

        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            preventiveAlarmVibrator = vibrator
            val pattern = longArrayOf(0, 700, 250, 700, 250)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, 0)
            }
        } catch (_: Exception) {
            preventiveAlarmVibrator = null
        }
    }

    private fun startBundledPreventiveAlarm() {
        try {
            val soundId = resources.getIdentifier("preventive_alarm", "raw", packageName)
            if (soundId != 0) {
                preventiveAlarmPlayer = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                    setDataSource(
                        this@MainActivity,
                        Uri.parse("android.resource://$packageName/$soundId"),
                    )
                    isLooping = true
                    prepare()
                    start()
                }
            }
        } catch (_: Exception) {
            preventiveAlarmPlayer = null
        }
    }

    private fun stopPreventiveAlarmEffect() {
        try {
            preventiveAlarmPlayer?.run {
                if (isPlaying) stop()
                release()
            }
        } catch (_: Exception) {
            // MediaPlayer may already have been released by the system.
        } finally {
            preventiveAlarmPlayer = null
        }
        try {
            preventiveAlarmVibrator?.cancel()
        } catch (_: Exception) {
            // Vibration can be unavailable on devices without a vibrator.
        } finally {
            preventiveAlarmVibrator = null
        }
        abandonPreventiveAlarmAudioFocus()
    }

    private fun requestPreventiveAlarmAudioFocus() {
        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener { }
                .build()
            preventiveAlarmAudioFocusRequest = request
            manager.requestAudioFocus(request)
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        }
    }

    private fun abandonPreventiveAlarmAudioFocus() {
        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            preventiveAlarmAudioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
            preventiveAlarmAudioFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(null)
        }
    }

    private fun preventiveAlarmPermissionState(): Map<String, Boolean> {
        val overlay = Settings.canDrawOverlays(this)
        val exactAlarm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager).canScheduleExactAlarms()
        } else {
            true
        }
        val fullScreenIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).canUseFullScreenIntent()
        } else {
            true
        }
        return mapOf(
            "overlay" to overlay,
            "exactAlarm" to exactAlarm,
            "fullScreenIntent" to fullScreenIntent,
        )
    }

    private fun openPreventiveAlarmPermissionSettings(): Boolean {
        // Xiaomi/POCO has a proprietary "Other permissions" page that governs
        // whether an app may open its alarm activity from the background.
        if (Build.MANUFACTURER.equals("Xiaomi", ignoreCase = true) ||
            Build.MANUFACTURER.equals("POCO", ignoreCase = true) ||
            Build.BRAND.equals("POCO", ignoreCase = true)) {
            try {
                startActivity(Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                    setClassName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.permissions.PermissionsEditorActivity",
                    )
                    putExtra("extra_pkgname", packageName)
                })
                return true
            } catch (_: Exception) {
                // Fall through to Android's standard full-screen-intent page.
            }
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:$packageName")
                })
            } else {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                })
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun openExactAlarmPermissionSettings(): Boolean = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:$packageName")
            })
            true
        } else {
            false
        }
    } catch (_: Exception) {
        false
    }

    private fun openOverlayPermissionSettings(): Boolean = try {
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
            data = Uri.parse("package:$packageName")
        })
        true
    } catch (_: Exception) {
        false
    }

    override fun onDestroy() {
        stopPreventiveAlarmEffect()
        super.onDestroy()
    }

    private fun applyLauncherBadge(count: Int) {
        val component = ComponentName(this, MainActivity::class.java)
        val packageName = packageName
        val className = component.className

        try {
            if (count > 0) {
                ShortcutBadger.applyCount(applicationContext, count)
            } else {
                ShortcutBadger.removeCount(applicationContext)
            }
        } catch (_: Exception) {
            // Continue with manufacturer-specific fallbacks below.
        }

        sendBadgeBroadcast(
            Intent("android.intent.action.BADGE_COUNT_UPDATE").apply {
                putExtra("badge_count", count)
                putExtra("badge_count_package_name", packageName)
                putExtra("badge_count_class_name", className)
            },
        )

        sendBadgeBroadcast(
            Intent("com.sonyericsson.home.action.UPDATE_BADGE").apply {
                putExtra("com.sonyericsson.home.intent.extra.badge.ACTIVITY_NAME", className)
                putExtra("com.sonyericsson.home.intent.extra.badge.SHOW_MESSAGE", count > 0)
                putExtra("com.sonyericsson.home.intent.extra.badge.MESSAGE", count.toString())
                putExtra("com.sonyericsson.home.intent.extra.badge.PACKAGE_NAME", packageName)
            },
        )

        sendBadgeBroadcast(
            Intent("launcher.action.CHANGE_APPLICATION_NOTIFICATION_NUM").apply {
                putExtra("packageName", packageName)
                putExtra("className", className)
                putExtra("notificationNum", count)
            },
        )

        sendBadgeBroadcast(
            Intent("com.oppo.unsettledevent").apply {
                putExtra("packageName", packageName)
                putExtra("number", count)
                putExtra("upgradeNumber", count)
            },
        )

        sendBadgeBroadcast(
            Intent("me.leolin.shortcutbadger.BADGE_COUNT_UPDATE").apply {
                putExtra("badge_count", count)
                putExtra("badge_count_package_name", packageName)
                putExtra("badge_count_class_name", className)
            },
        )

        try {
            val extras = Bundle().apply {
                putString("package", packageName)
                putString("class", className)
                putInt("badgenumber", count)
            }
            contentResolver.call(
                Uri.parse("content://com.huawei.android.launcher.settings/badge/"),
                "change_badge",
                null,
                extras,
            )
        } catch (_: Exception) {
            // The summary notification remains the fallback for other launchers.
        }
    }

    private fun sendBadgeBroadcast(intent: Intent) {
        try {
            sendBroadcast(intent)
        } catch (_: Exception) {
            // Unsupported launcher; keep trying the remaining implementations.
        }
    }
}
