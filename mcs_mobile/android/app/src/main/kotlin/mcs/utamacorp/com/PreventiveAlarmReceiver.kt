package mcs.utamacorp.com

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingReceiver

class PreventiveAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val data = intent.extras?.keySet()?.associateWith { key ->
            intent.extras?.get(key)?.toString().orEmpty()
        } ?: run {
            forwardToFlutter(context, intent)
            return
        }

        val isPreventiveAlarm = data["type"]
            ?.trim()
            ?.equals("preventive_alarm", ignoreCase = true) == true

        if (!isPreventiveAlarm) {
            forwardToFlutter(context, intent)
            return
        }

        try {
            PreventiveAlarmNotifier.show(context, data)
        } catch (_: Exception) {
            // Preserve normal FlutterFire delivery if the native alarm cannot
            // be posted on a device-specific Android implementation.
            forwardToFlutter(context, intent)
            return
        }

        // Always post the Android alarm notification first. Previously a
        // foreground app delegated this entirely to Flutter, so an error or
        // delayed Flutter isolate could make the preventive alarm invisible.
        // Flutter still receives the message below to render its in-app card.
        if (isAppForeground(context)) {
            forwardToFlutter(context, intent)
            return
        }

        if (!PreventiveAlarmScheduler.schedule(context, data)) {
            try {
                // Fallback for devices on which the exact-alarm permission has
                // not yet been granted.
                if (!PreventiveAlarmNotifier.openAlarmOverlay(context, data)) {
                    PreventiveAlarmNotifier.openAlarmActivity(context, data)
                }
            } catch (_: Exception) {
                // The visible notification remains the final fallback.
            }
        }
    }

    private fun forwardToFlutter(context: Context, intent: Intent) {
        FlutterFirebaseMessagingReceiver().onReceive(context, intent)
    }

    private fun isAppForeground(context: Context): Boolean {
        val processInfo = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(processInfo)
        return processInfo.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }
}

class PreventiveAlarmTriggerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val data = mapOf(
            "title" to intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_TITLE).orEmpty(),
            "body" to intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_BODY).orEmpty(),
            "alarm_sound_url" to intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL).orEmpty(),
        )
        PreventiveAlarmNotifier.show(context, data)
        if (!PreventiveAlarmNotifier.openAlarmOverlay(context, data)) {
            PreventiveAlarmNotifier.openAlarmActivity(context, data)
        }
    }
}

object PreventiveAlarmScheduler {
    private const val REQUEST_CODE = 91531

    fun schedule(context: Context, data: Map<String, String>): Boolean {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            return false
        }

        val title = data["title"]?.trim().orEmpty().ifEmpty { "Preventive Alarm" }
        val body = data["body"]?.trim().orEmpty().ifEmpty {
            "Masih ada WO preventive hari ini yang belum selesai."
        }
        val soundUrl = data["alarm_sound_url"]?.trim().orEmpty()
        val triggerPendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, PreventiveAlarmTriggerReceiver::class.java).apply {
                putExtra(PreventiveAlarmNotifier.EXTRA_TITLE, title)
                putExtra(PreventiveAlarmNotifier.EXTRA_BODY, body)
                putExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL, soundUrl)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val showPendingIntent = PendingIntent.getActivity(
            context,
            REQUEST_CODE,
            Intent(context, PreventiveAlarmActivity::class.java).apply {
                putExtra(PreventiveAlarmNotifier.EXTRA_TITLE, title)
                putExtra(PreventiveAlarmNotifier.EXTRA_BODY, body)
                putExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL, soundUrl)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return try {
            alarmManager.setAlarmClock(
                AlarmManager.AlarmClockInfo(System.currentTimeMillis() + 1500L, showPendingIntent),
                triggerPendingIntent,
            )
            true
        } catch (_: SecurityException) {
            false
        }
    }
}

object PreventiveAlarmNotifier {
    // Android notification-channel settings are immutable after the first
    // install. A new ID applies the alarm configuration to existing users
    // when they update, without asking them to clear app data.
    const val CHANNEL_ID = "mcs_preventive_alarm_v4"
    const val NOTIFICATION_ID = 91530
    const val EXTRA_TITLE = "preventive_alarm_title"
    const val EXTRA_BODY = "preventive_alarm_body"
    const val EXTRA_SOUND_URL = "preventive_alarm_sound_url"

    fun show(context: Context, data: Map<String, String>) {
        createChannel(context)

        val title = data["title"]?.trim().orEmpty().ifEmpty { "Preventive Alarm" }
        val body = data["body"]?.trim().orEmpty().ifEmpty {
            "Masih ada WO preventive hari ini yang belum selesai."
        }
        val soundUrl = data["alarm_sound_url"]?.trim().orEmpty()
        val alarmIntent = Intent(context, PreventiveAlarmActivity::class.java).apply {
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_BODY, body)
            putExtra(EXTRA_SOUND_URL, soundUrl)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            alarmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            Notification.Builder(context)
                .setSound(soundUri(context))
                .setVibrate(longArrayOf(0, 700, 250, 700, 250))
        }

        builder
            .setSmallIcon(R.mipmap.launcher_icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(false)
            .setOngoing(true)

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, builder.build())
    }

    fun cancel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID)
        PreventiveAlarmOverlayService.stop(context)
    }

    fun openAlarmOverlay(context: Context, data: Map<String, String>): Boolean {
        val title = data["title"]?.trim().orEmpty().ifEmpty { "Preventive Alarm" }
        val body = data["body"]?.trim().orEmpty().ifEmpty {
            "Masih ada WO preventive hari ini yang belum selesai."
        }
        return PreventiveAlarmOverlayService.start(
            context,
            title,
            body,
            data["alarm_sound_url"]?.trim().orEmpty(),
        )
    }

    fun openAlarmActivity(context: Context, data: Map<String, String>) {
        val title = data["title"]?.trim().orEmpty().ifEmpty { "Preventive Alarm" }
        val body = data["body"]?.trim().orEmpty().ifEmpty {
            "Masih ada WO preventive hari ini yang belum selesai."
        }
        val soundUrl = data["alarm_sound_url"]?.trim().orEmpty()
        context.startActivity(
            Intent(context, PreventiveAlarmActivity::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_BODY, body)
                putExtra(EXTRA_SOUND_URL, soundUrl)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
        )
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Preventive Alarm",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alarm untuk WO preventive yang masih belum selesai"
            setSound(soundUri(context), attributes)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 250, 700, 250)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun soundUri(context: Context): Uri = Uri.parse(
        "android.resource://${context.packageName}/${R.raw.preventive_alarm}",
    )
}
