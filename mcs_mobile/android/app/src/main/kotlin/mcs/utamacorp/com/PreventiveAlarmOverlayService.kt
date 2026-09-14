package mcs.utamacorp.com

import android.app.Notification
import android.app.Service
import android.content.pm.ServiceInfo
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Draws the alarm above the launcher when Android/MIUI refuses a background
 * Activity launch. It is only started after the user explicitly grants the
 * system "Display over other apps" special permission.
 */
class PreventiveAlarmOverlayService : Service() {
    private var overlayView: View? = null
    private var alarmPlayer: MediaPlayer? = null
    private var alarmVibrator: Vibrator? = null
    private var alarmAudioFocusRequest: AudioFocusRequest? = null

    companion object {
        fun start(context: Context, title: String, body: String, soundUrl: String): Boolean {
            if (!Settings.canDrawOverlays(context)) return false
            val intent = Intent(context, PreventiveAlarmOverlayService::class.java).apply {
                putExtra(PreventiveAlarmNotifier.EXTRA_TITLE, title)
                putExtra(PreventiveAlarmNotifier.EXTRA_BODY, body)
                putExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL, soundUrl)
            }
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                true
            } catch (_: Exception) {
                false
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PreventiveAlarmOverlayService::class.java))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                PreventiveAlarmNotifier.NOTIFICATION_ID,
                foregroundNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(PreventiveAlarmNotifier.NOTIFICATION_ID, foregroundNotification())
        }
        removeOverlay()
        showOverlay(
            intent?.getStringExtra(PreventiveAlarmNotifier.EXTRA_TITLE).orEmpty(),
            intent?.getStringExtra(PreventiveAlarmNotifier.EXTRA_BODY).orEmpty(),
        )
        startAlarmEffect(intent?.getStringExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL).orEmpty())
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopAlarmEffect()
        removeOverlay()
        super.onDestroy()
    }

    private fun foregroundNotification(): Notification =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, PreventiveAlarmNotifier.CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }.setSmallIcon(R.mipmap.launcher_icon)
            .setContentTitle("Preventive Alarm")
            .setContentText("Alarm preventive sedang aktif")
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .build()

    private fun showOverlay(rawTitle: String, rawBody: String) {
        val title = rawTitle.trim().ifEmpty { "Preventive Alarm" }
        val body = rawBody.trim().ifEmpty {
            "Masih ada WO preventive hari ini yang belum selesai."
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(22), dp(28), dp(22), dp(28))
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.rgb(205, 30, 30), Color.rgb(105, 8, 8)),
            ).apply { cornerRadius = dp(32).toFloat() }

            addView(label("!", 62, Color.rgb(198, 35, 35), true).apply {
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.WHITE)
                }
                setTextColor(Color.rgb(198, 35, 35))
                layoutParams = LinearLayout.LayoutParams(dp(104), dp(104)).apply {
                    bottomMargin = dp(24)
                    gravity = Gravity.CENTER_HORIZONTAL
                }
            })
            addView(label("ALARM PREVENTIVE", 27, Color.WHITE, true).apply {
                gravity = Gravity.CENTER
            })
            addView(label(title, 20, Color.WHITE, true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(16), 0, 0)
            })
            addView(label(body, 18, Color.rgb(255, 235, 235), false).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(20), 0, 0)
            })
            addView(label(
                "Masih ada WO preventive hari ini yang belum selesai.\nSegera periksa dan tindak lanjuti.",
                16,
                Color.WHITE,
                false,
            ).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(30), 0, dp(34))
            })
            addView(Button(this@PreventiveAlarmOverlayService).apply {
                text = "SAYA MENGERTI"
                textSize = 16f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.rgb(190, 30, 30))
                background = GradientDrawable().apply {
                    setColor(Color.WHITE)
                    cornerRadius = dp(28).toFloat()
                }
                setOnClickListener { acknowledge() }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(56),
                )
            })
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(175, 0, 0, 0))
            isClickable = true
            addView(
                content,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    leftMargin = dp(18)
                    rightMargin = dp(18)
                    gravity = Gravity.CENTER
                },
            )
        }
        overlayView = root
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            android.graphics.PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.CENTER
        }
        (getSystemService(WINDOW_SERVICE) as WindowManager).addView(root, params)
    }

    private fun removeOverlay() {
        val view = overlayView ?: return
        try {
            (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(view)
        } catch (_: Exception) {
            // The system may have already removed a stale overlay window.
        }
        overlayView = null
    }

    private fun startAlarmEffect(@Suppress("UNUSED_PARAMETER") soundUrl: String) {
        requestAlarmAudioFocus()
        // The native MP3 is part of the APK and works without server/network
        // access when this overlay is started from the background.
        startBundledAlarmEffect()
        startVibration()
    }

    private fun startBundledAlarmEffect() {
        try {
            alarmPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(this@PreventiveAlarmOverlayService,
                    Uri.parse("android.resource://$packageName/${R.raw.preventive_alarm}"))
                isLooping = true
                prepare()
                start()
            }
        } catch (_: Exception) {
            alarmPlayer = null
        }
    }

    private fun startVibration() {
        try {
            alarmVibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 700, 250, 700, 250)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                alarmVibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                alarmVibrator?.vibrate(pattern, 0)
            }
        } catch (_: Exception) {
            alarmVibrator = null
        }
    }

    private fun stopAlarmEffect() {
        try {
            alarmPlayer?.release()
        } catch (_: Exception) {
        } finally {
            alarmPlayer = null
        }
        try {
            alarmVibrator?.cancel()
        } catch (_: Exception) {
        } finally {
            alarmVibrator = null
        }
        abandonAlarmAudioFocus()
    }

    private fun requestAlarmAudioFocus() {
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
            alarmAudioFocusRequest = request
            manager.requestAudioFocus(request)
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        }
    }

    private fun abandonAlarmAudioFocus() {
        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            alarmAudioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
            alarmAudioFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(null)
        }
    }

    private fun acknowledge() {
        PreventiveAlarmNotifier.cancel(this)
        stopSelf()
    }

    private fun label(value: String, size: Int, color: Int, bold: Boolean): TextView =
        TextView(this).apply {
            text = value
            textSize = size.toFloat()
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
