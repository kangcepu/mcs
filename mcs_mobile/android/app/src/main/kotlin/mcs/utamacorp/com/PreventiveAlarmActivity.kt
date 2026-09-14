package mcs.utamacorp.com

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class PreventiveAlarmActivity : Activity() {
    private var alarmPlayer: MediaPlayer? = null
    private var alarmVibrator: Vibrator? = null
    private var alarmAudioFocusRequest: AudioFocusRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(createContent())
        startAlarmEffect(intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL).orEmpty())
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        startAlarmEffect(intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_SOUND_URL).orEmpty())
    }

    @Deprecated("Alarm must be acknowledged explicitly")
    override fun onBackPressed() {
        // Acknowledge button is intentionally the only dismissal action.
    }

    override fun onDestroy() {
        stopAlarmEffect()
        super.onDestroy()
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
    }

    private fun createContent(): LinearLayout {
        val title = intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_TITLE)
            ?.trim()
            .orEmpty()
            .ifEmpty { "Preventive Alarm" }
        val body = intent.getStringExtra(PreventiveAlarmNotifier.EXTRA_BODY)
            ?.trim()
            .orEmpty()
            .ifEmpty { "Masih ada WO preventive hari ini yang belum selesai." }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(34), dp(28), dp(34))
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.rgb(205, 30, 30), Color.rgb(105, 8, 8)),
            )

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
                letterSpacing = 0.03f
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
            addView(Button(this@PreventiveAlarmActivity).apply {
                text = "✓  SAYA MENGERTI"
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
    }

    private fun label(value: String, size: Int, color: Int, bold: Boolean): TextView =
        TextView(this).apply {
            text = value
            textSize = size.toFloat()
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }

    private fun startAlarmEffect(@Suppress("UNUSED_PARAMETER") soundUrl: String) {
        stopAlarmEffect()
        requestAlarmAudioFocus()
        // Always use the tone embedded in this APK. It is available before
        // Android brings the Flutter engine to the foreground.
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
                setDataSource(
                    this@PreventiveAlarmActivity,
                    Uri.parse("android.resource://$packageName/${R.raw.preventive_alarm}"),
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (_: Exception) {
            alarmPlayer?.release()
            alarmPlayer = null
        }
    }

    private fun startVibration() {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            alarmVibrator = vibrator
            val pattern = longArrayOf(0, 700, 250, 700, 250)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, 0)
            }
        } catch (_: Exception) {
            alarmVibrator = null
        }
    }

    private fun stopAlarmEffect() {
        try {
            alarmPlayer?.run {
                if (isPlaying) stop()
                release()
            }
        } catch (_: Exception) {
            // The media player may already be released by Android.
        } finally {
            alarmPlayer = null
        }
        try {
            alarmVibrator?.cancel()
        } catch (_: Exception) {
            // The device may not provide a vibrator.
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
        stopAlarmEffect()
        PreventiveAlarmNotifier.cancel(this)
        finish()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
