import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:get/get.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/api_constants.dart';
import '../routes/app_routes.dart';
import '../../data/repositories/daily_control_repository.dart';
import '../../data/providers/update_provider.dart';
import '../../data/providers/api_service.dart';
import '../widgets/update_dialog.dart';
import '../../modules/daily_control/controllers/daily_control_controller.dart';

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();

  static const String _channelId = 'mcs_realtime_channel';
  static const String _channelName = 'MCS Realtime Notification';
  static const String _channelDescription =
      'Realtime notifications for Maintenance Control System';
  // Preview thread tetap boleh tampil di notification shade, tetapi tidak boleh
  // dihitung launcher sebagai jumlah unread. Xiaomi/MIUI mengutamakan jumlah
  // notifikasi aktif dibanding `number` pada notification summary.
  static const String _dailyControlPreviewChannelId =
      'mcs_daily_control_preview';
  static const String _dailyControlPreviewChannelName =
      'MCS Daily Control Preview';
  // Android notification channels are immutable after their first creation.
  // A new ID is therefore required to upgrade existing installations from a
  // normal heads-up notification to the alarm channel below.
  // Android channels are immutable per ID. Keep this aligned with the native
  // receiver so upgrades receive the current alarm-channel configuration.
  static const String _preventiveAlarmChannelId = 'mcs_preventive_alarm_v4';
  static const String _preventiveAlarmChannelName = 'Preventive Alarm';
  static const String _preventiveAlarmChannelDescription =
      'Reminder at 15:30 for preventive work orders still in progress';
  static const String _fcmTokenStorageKey = 'fcm_token';
  static const String _dailyControlBadgeStorageKey =
      'daily_control_badge_count';
  static const String _pendingNavigationStorageKey =
      'pending_notification_navigation';
  static const String _preventiveAlarmPermissionGuideKey =
      'preventive_alarm_permission_guide_v4';
  static const String _preventiveAlarmGuideBuildKey =
      'preventive_alarm_permission_guide_build';
  static const String _dailyControlChildNotificationIdsStorageKey =
      'daily_control_child_notification_ids';
  static const int _dailyControlSummaryNotificationId = 910001;
  static const String _dailyControlNotificationGroupKey =
      'daily_control_unread_threads';
  static const MethodChannel _appBadgeChannel =
      MethodChannel('mcs.utamacorp.com/app_badge');
  static const MethodChannel _preventiveAlarmEffectChannel =
      MethodChannel('mcs.utamacorp.com/preventive_alarm_effect');

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final ApiService _apiService = ApiService();
  final DailyControlRepository _dailyControlRepository =
      DailyControlRepository();
  final StreamController<Map<String, dynamic>> _messageController =
      StreamController<Map<String, dynamic>>.broadcast();

  bool _isInitialized = false;
  bool _preventiveAlarmOverlayVisible = false;
  int _badgeUpdateVersion = 0;

  Stream<Map<String, dynamic>> get messageStream => _messageController.stream;

  Future<void> initialize() async {
    if (_isInitialized) {
      return;
    }

    try {
      await _initializeLocalNotifications();
      await _initializeFirebaseMessaging();
      if (Platform.isAndroid) {
        await _requestAndroidPermission();
      }
      await restoreDailyControlBadgeCount();
      await syncTokenWithBackend();
      _isInitialized = true;
      debugPrint('PushNotificationService initialized with Firebase');
    } catch (e) {
      _isInitialized = false;
      debugPrint('PushNotificationService init failed: $e');
    }
  }

  Future<void> ensureInitializedForBackground() async {
    if (_isInitialized) {
      return;
    }

    try {
      await _initializeLocalNotifications();
      _isInitialized = true;
    } catch (e) {
      _isInitialized = false;
      debugPrint('PushNotificationService background init failed: $e');
    }
  }

  Future<void> _initializeLocalNotifications() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/launcher_icon');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      settings,
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    final androidPlugin =
        _localNotifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();

    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: _channelDescription,
        importance: Importance.max,
        showBadge: true,
      ),
    );
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _dailyControlPreviewChannelId,
        _dailyControlPreviewChannelName,
        description: 'Unread Daily Control conversation previews',
        importance: Importance.max,
        showBadge: false,
      ),
    );
    await androidPlugin?.createNotificationChannel(
      AndroidNotificationChannel(
        _preventiveAlarmChannelId,
        _preventiveAlarmChannelName,
        description: _preventiveAlarmChannelDescription,
        importance: Importance.max,
        playSound: true,
        sound: RawResourceAndroidNotificationSound('preventive_alarm'),
        enableVibration: true,
        vibrationPattern: Int64List.fromList(<int>[0, 500, 250, 500]),
        showBadge: true,
        audioAttributesUsage: AudioAttributesUsage.alarm,
      ),
    );
  }

  Future<void> _initializeFirebaseMessaging() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    debugPrint('FCM permission status: ${settings.authorizationStatus}');

    await _messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      await handleRemoteMessage(
        initialMessage,
        shouldShowLocalNotification: false,
        shouldUpdateBadge: false,
      );
    }

    FirebaseMessaging.onMessage.listen((message) async {
      await handleRemoteMessage(message);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) async {
      await handleRemoteMessage(
        message,
        shouldShowLocalNotification: false,
        shouldUpdateBadge: false,
      );
    });

    _messaging.onTokenRefresh.listen((token) async {
      final prefs = await SharedPreferences.getInstance();
      final previousToken = prefs.getString(_fcmTokenStorageKey);
      await _saveLocalToken(token);
      await syncTokenWithBackend(previousTokenOverride: previousToken);
    });
  }

  Future<void> _requestAndroidPermission() async {
    final androidPlugin =
        _localNotifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.requestNotificationsPermission();
  }

  Future<Map<String, bool>?> _readAlarmPermissionState() async {
    try {
      final raw = await _appBadgeChannel.invokeMapMethod<String, dynamic>(
        'getPreventiveAlarmPermissionState',
      );
      if (raw == null) return null;
      return {for (final entry in raw.entries) entry.key: entry.value == true};
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  static Future<void> clearPreferencesKeepingPermissionFlags(
    SharedPreferences prefs,
  ) async {
    final guideDone = prefs.getBool(_preventiveAlarmPermissionGuideKey);
    final guideBuild = prefs.getString(_preventiveAlarmGuideBuildKey);
    await prefs.clear();
    if (guideDone != null) {
      await prefs.setBool(_preventiveAlarmPermissionGuideKey, guideDone);
    }
    if (guideBuild != null) {
      await prefs.setString(_preventiveAlarmGuideBuildKey, guideBuild);
    }
  }

  Future<void> showPreventiveAlarmPermissionGuideIfNeeded() async {
    if (!Platform.isAndroid) return;

    final prefs = await SharedPreferences.getInstance();
    final state = await _readAlarmPermissionState();

    if (state != null && state.values.every((granted) => granted)) {
      await prefs.setBool(_preventiveAlarmPermissionGuideKey, true);
      return;
    }

    final build = (await PackageInfo.fromPlatform()).buildNumber;
    if (state == null) {
      if (prefs.getBool(_preventiveAlarmPermissionGuideKey) ?? false) return;
    } else if (prefs.getString(_preventiveAlarmGuideBuildKey) == build) {
      return;
    }

    final context = Get.overlayContext;
    if (context == null || (Get.isDialogOpen ?? false)) {
      return;
    }

    await prefs.setString(_preventiveAlarmGuideBuildKey, build);

    final needFullScreen = state == null || state['fullScreenIntent'] != true;
    final needExact = state == null || state['exactAlarm'] != true;
    final needOverlay = state == null || state['overlay'] != true;
    final missing = <String>[
      if (needFullScreen) 'Notifikasi layar penuh (pop-up)',
      if (needExact) 'Alarm & reminders',
      if (needOverlay) 'Tampilkan di atas aplikasi lain',
    ];

    await Get.dialog<void>(
      PopScope(
        canPop: false,
        child: AlertDialog(
          title: const Text('Izin Preventive Alarm'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Agar alarm preventive tampil di atas Home seperti alarm jam saat '
                'MCS tidak dibuka, aktifkan izin berikut:',
              ),
              const SizedBox(height: 10),
              for (final item in missing)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text('• $item'),
                ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              onPressed: Get.back,
              child: const Text('NANTI'),
            ),
            if (needFullScreen)
              OutlinedButton(
                onPressed: _openPreventiveAlarmPermissionSettings,
                child: const Text('IZIN POP-UP'),
              ),
            if (needExact)
              OutlinedButton(
                onPressed: _openExactAlarmPermissionSettings,
                child: const Text('IZIN ALARM'),
              ),
            if (needOverlay)
              ElevatedButton(
                onPressed: () async {
                  Get.back();
                  await prefs.setBool(_preventiveAlarmPermissionGuideKey, true);
                  await _openOverlayPermissionSettings();
                },
                child: const Text('IZIN TAMPIL'),
              ),
          ],
        ),
      ),
      barrierDismissible: false,
    );
  }

  Future<void> _openPreventiveAlarmPermissionSettings() async {
    try {
      await _appBadgeChannel.invokeMethod<void>(
        'openPreventiveAlarmPermissionSettings',
      );
    } on PlatformException catch (e) {
      debugPrint(
          'Failed to open preventive alarm permission settings: ${e.message}');
    } on MissingPluginException {
      debugPrint('Preventive alarm permission settings channel is unavailable');
    }
  }

  Future<void> _openExactAlarmPermissionSettings() async {
    try {
      await _appBadgeChannel.invokeMethod<void>(
        'openExactAlarmPermissionSettings',
      );
    } on PlatformException catch (e) {
      debugPrint(
          'Failed to open exact alarm permission settings: ${e.message}');
    } on MissingPluginException {
      debugPrint('Exact alarm permission settings channel is unavailable');
    }
  }

  Future<void> _openOverlayPermissionSettings() async {
    try {
      await _appBadgeChannel.invokeMethod<void>(
        'openOverlayPermissionSettings',
      );
    } on PlatformException catch (e) {
      debugPrint('Failed to open overlay permission settings: ${e.message}');
    } on MissingPluginException {
      debugPrint('Overlay permission settings channel is unavailable');
    }
  }

  void _onNotificationTapped(NotificationResponse response) {
    debugPrint('Notification tapped: ${response.payload}');
    final payload = _parseNotificationPayloadString(response.payload);
    if (payload.isNotEmpty) {
      _handleNotificationNavigation(payload);
    }
  }

  Future<void> handleRemoteMessage(
    RemoteMessage message, {
    bool shouldShowLocalNotification = true,
    bool shouldUpdateBadge = true,
  }) async {
    final notification = message.notification;
    final title = notification?.title ??
        message.data['title']?.toString() ??
        'MCS Notification';
    final body = notification?.body ??
        message.data['body']?.toString() ??
        'Ada update baru';
    final messageType = message.data['type']?.toString().trim().toLowerCase();
    int? badgeCount;

    if (messageType == 'daily_control_comment' && shouldUpdateBadge) {
      badgeCount = await _resolveDailyControlBadgeCount(message.data);
    }

    _emitMessageEvent(message.data);

    debugPrint('FCM message received: ${message.messageId}');

    if (messageType == 'daily_control_comment') {
      if (shouldShowLocalNotification) {
        await _syncDailyControlSummaryNotification(
          badgeCount ?? await getDailyControlBadgeCount(),
        );
      } else {
        await _handleNotificationNavigation(message.data);
      }
      return;
    }

    if (messageType == 'app_update') {
      if (!shouldShowLocalNotification) {
        await _handleNotificationNavigation(message.data);
        return;
      }

      await showLocalNotification(
        id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title: title,
        body: body,
        payload: message.data.isEmpty ? null : jsonEncode(message.data),
      );
      return;
    }

    if (messageType == 'preventive_alarm') {
      if (!shouldShowLocalNotification) {
        return;
      }

      // Ketika aplikasi sedang terbuka, Android biasanya hanya mengizinkan
      // heads-up notification. Tampilkan dialog besar dari dalam MCS agar
      // alarm tetap terlihat jelas tanpa bergantung pada kebijakan launcher.
      final shownInApp = await _showPreventiveAlarmOverlay(
        title: title,
        body: body,
        soundUrl: message.data['alarm_sound_url']?.toString() ?? '',
      );
      if (!shownInApp) {
        await showPreventiveAlarmNotification(
          id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
          title: title,
          body: body,
          payload: message.data.isEmpty ? null : jsonEncode(message.data),
        );
      }
      return;
    }

    if (!shouldShowLocalNotification) {
      await _handleNotificationNavigation(message.data);
      return;
    }

    await this.showLocalNotification(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: title,
      body: body,
      payload: message.data.isEmpty ? null : jsonEncode(message.data),
      badgeCount: badgeCount,
    );
  }

  Future<void> processPendingNavigation() async {
    final payload = await _takePendingNavigation();
    if (payload.isEmpty) {
      return;
    }

    await _handleNotificationNavigation(payload);
  }

  Future<void> showLocalNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
    int? badgeCount,
  }) async {
    final safeBadgeCount =
        badgeCount != null && badgeCount >= 0 ? badgeCount : null;

    final androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDescription,
      importance: Importance.max,
      priority: Priority.high,
      icon: '@mipmap/launcher_icon',
      channelShowBadge: true,
      number: safeBadgeCount,
    );
    final iosDetails = DarwinNotificationDetails(
      badgeNumber: safeBadgeCount,
    );

    await _localNotifications.show(
      id,
      title,
      body,
      NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      ),
      payload: payload,
    );
  }

  Future<void> showPreventiveAlarmNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    final androidDetails = AndroidNotificationDetails(
      _preventiveAlarmChannelId,
      _preventiveAlarmChannelName,
      channelDescription: _preventiveAlarmChannelDescription,
      importance: Importance.max,
      priority: Priority.max,
      icon: '@mipmap/launcher_icon',
      playSound: true,
      sound: const RawResourceAndroidNotificationSound('preventive_alarm'),
      enableVibration: true,
      vibrationPattern: Int64List.fromList(<int>[0, 500, 250, 500]),
      channelShowBadge: true,
      category: AndroidNotificationCategory.alarm,
      fullScreenIntent: true,
      audioAttributesUsage: AudioAttributesUsage.alarm,
    );
    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    await _localNotifications.show(
      id,
      title,
      body,
      NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: payload,
    );
  }

  Future<bool> _showPreventiveAlarmOverlay({
    required String title,
    required String body,
    required String soundUrl,
  }) async {
    // Handler FCM background berjalan di isolate tanpa UI. Dalam kondisi itu
    // notifikasi Android/full-screen intent di atas yang bertugas.
    final overlayContext = Get.overlayContext;
    if (overlayContext == null || _preventiveAlarmOverlayVisible) {
      return false;
    }

    _preventiveAlarmOverlayVisible = true;
    try {
      await _startForegroundPreventiveAlarmEffect(soundUrl);
      if (!overlayContext.mounted) {
        return false;
      }
      await showDialog<void>(
        context: overlayContext,
        barrierDismissible: false,
        barrierColor: Colors.black87,
        builder: (dialogContext) {
          return PopScope(
            canPop: false,
            child: Dialog(
              insetPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 42),
              backgroundColor: Colors.transparent,
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxWidth: 520),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: <Color>[Color(0xFFB71C1C), Color(0xFF5F0909)],
                  ),
                  boxShadow: const <BoxShadow>[
                    BoxShadow(
                      color: Colors.black54,
                      blurRadius: 28,
                      offset: Offset(0, 14),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(26, 30, 26, 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Container(
                        width: 88,
                        height: 88,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.notification_important_rounded,
                          size: 52,
                          color: Color(0xFFC62828),
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'ALARM PREVENTIVE',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 23,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .5,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        body,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFFFFEBEE),
                          fontSize: 16,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 22),
                      const Text(
                        'Masih ada WO preventive hari ini yang belum selesai. '
                        'Segera periksa dan tindak lanjuti.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 28),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: ElevatedButton.icon(
                          onPressed: () => Navigator.of(dialogContext).pop(),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: const Color(0xFFB71C1C),
                            textStyle: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                          icon: const Icon(Icons.check_circle_outline),
                          label: const Text('SAYA MENGERTI'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
    } catch (e) {
      debugPrint('Failed to show preventive alarm overlay: $e');
      return false;
    } finally {
      await _stopForegroundPreventiveAlarmEffect();
      _preventiveAlarmOverlayVisible = false;
    }
    return true;
  }

  Future<void> _startForegroundPreventiveAlarmEffect(String soundUrl) async {
    if (!Platform.isAndroid) return;

    try {
      await _preventiveAlarmEffectChannel.invokeMethod<void>(
        'startPreventiveAlarm',
        <String, String>{'soundUrl': soundUrl},
      );
    } on PlatformException catch (e) {
      debugPrint('Failed to start preventive alarm effect: ${e.message}');
    } on MissingPluginException {
      debugPrint('Preventive alarm effect channel is unavailable');
    }
  }

  Future<void> _stopForegroundPreventiveAlarmEffect() async {
    if (!Platform.isAndroid) return;

    try {
      await _preventiveAlarmEffectChannel.invokeMethod<void>(
        'stopPreventiveAlarm',
      );
    } on PlatformException catch (e) {
      debugPrint('Failed to stop preventive alarm effect: ${e.message}');
    } on MissingPluginException {
      debugPrint('Preventive alarm effect channel is unavailable');
    }
  }

  Future<int> getDailyControlBadgeCount() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_dailyControlBadgeStorageKey) ?? 0;
  }

  Future<void> restoreDailyControlBadgeCount() async {
    final prefs = await SharedPreferences.getInstance();
    final authToken = prefs.getString('token')?.trim() ?? '';
    final storedCount = prefs.getInt(_dailyControlBadgeStorageKey) ?? 0;

    if (authToken.isEmpty) {
      await setDailyControlBadgeCount(0);
      return;
    }

    await setDailyControlBadgeCount(storedCount);
  }

  Future<int> setDailyControlBadgeCount(int count) async {
    final safeCount = count < 0 ? 0 : count;
    final updateVersion = ++_badgeUpdateVersion;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_dailyControlBadgeStorageKey, safeCount);

    // Jangan menunggu request daftar chat. Pada Android yang mendukung badge,
    // ini membuat angka terlihat segera saat push diterima.
    await _applyAppIconBadgeCount(safeCount);

    if (updateVersion != _badgeUpdateVersion) {
      return safeCount;
    }

    await _syncDailyControlSummaryNotification(
      safeCount,
      badgeUpdateVersion: updateVersion,
    );

    // Sebagian launcher mengganti badge berdasarkan notifikasi aktif. Terapkan
    // lagi angka yang sama setelah ringkasan notifikasi dibuat.
    if (updateVersion == _badgeUpdateVersion) {
      await _applyAppIconBadgeCount(safeCount);
    }
    return safeCount;
  }

  Future<int> clearDailyControlBadgeCount() async {
    return setDailyControlBadgeCount(0);
  }

  Future<void> _applyAppIconBadgeCount(int count) async {
    if (!Platform.isAndroid) return;

    try {
      await _appBadgeChannel.invokeMethod<void>(
        'setBadgeCount',
        <String, dynamic>{'count': count < 0 ? 0 : count},
      );
    } on PlatformException catch (e) {
      debugPrint('Failed to apply Android launcher badge: ${e.message}');
    } on MissingPluginException {
      debugPrint('Android launcher badge channel is unavailable');
    }
  }

  Future<void> _syncDailyControlSummaryNotification(
    int count, {
    int? badgeUpdateVersion,
  }) async {
    if (!Platform.isAndroid) {
      return;
    }

    try {
      final isCurrentUpdate = badgeUpdateVersion == null ||
          badgeUpdateVersion == _badgeUpdateVersion;
      if (!isCurrentUpdate) {
        return;
      }

      if (count <= 0) {
        await _localNotifications.cancel(_dailyControlSummaryNotificationId);
        await _cancelDailyControlChildNotifications();
        return;
      }

      final body = count == 1
          ? 'Ada 1 chat Daily Control belum dibaca.'
          : 'Ada $count chat Daily Control belum dibaca.';

      // Notifikasi ringkasan dibuat lebih dulu. Sebelumnya badge baru dipasang
      // setelah request preview selesai, sehingga sering terlambat 3--5 detik.
      await _localNotifications.show(
        _dailyControlSummaryNotificationId,
        'Daily Control',
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            _channelName,
            channelDescription: _channelDescription,
            importance: Importance.max,
            priority: Priority.high,
            icon: '@mipmap/launcher_icon',
            channelShowBadge: true,
            number: count,
            onlyAlertOnce: true,
            groupKey: _dailyControlNotificationGroupKey,
            setAsGroupSummary: true,
            groupAlertBehavior: GroupAlertBehavior.summary,
            autoCancel: false,
            ongoing: false,
            category: AndroidNotificationCategory.message,
          ),
        ),
        payload: jsonEncode(<String, dynamic>{
          'type': 'daily_control_comment',
          'from_badge_summary': true,
          'open_unread_list': true,
        }),
      );

      final activities = await _loadDailyControlUnreadActivities(limit: 6);
      if (badgeUpdateVersion != null &&
          badgeUpdateVersion != _badgeUpdateVersion) {
        return;
      }
      final lines = activities
          .map(_buildDailyControlPreviewLine)
          .where((line) => line.isNotEmpty)
          .toList(growable: false);
      final messagingStyle =
          _buildDailyControlMessagingStyle(activities, count);

      // Setiap thread memiliki payload sendiri agar tap pada notifikasi selalu
      // membuka chat yang sesuai; summary hanya menjadi pintu ke daftar unread.
      await _showDailyControlThreadNotifications(activities);

      // Ambil daily_control_id dari activity terbaru untuk navigasi saat di-tap
      final latestDcId = activities.isNotEmpty
          ? (activities.first['id'] ??
              activities.first['daily_control_id'] ??
              0)
          : 0;
      final latestDate = activities.isNotEmpty
          ? (activities.first['activity_date'] ?? '')
          : '';
      final latestActivity =
          activities.isNotEmpty ? activities.first : const <String, dynamic>{};
      final payloadData = <String, dynamic>{
        'type': 'daily_control_comment',
        'from_badge_summary': true,
        // Ringkasan berisi beberapa thread. Karena Android tidak memberi
        // tahu baris mana yang disentuh, arahkan ke daftar unread agar tidak
        // membuka chat yang salah.
        'open_unread_list': true,
        'daily_control_id': latestDcId,
        'activity_date': latestDate,
        'activity_time': latestActivity['activity_time'] ?? '',
        'sender_name': _dailyControlSenderName(latestActivity),
        'latest_unread_message': _dailyControlMessageText(latestActivity),
        'asset_name': latestActivity['asset_name'] ?? '',
        'wo_number': latestActivity['wo_number'] ?? '',
        'activity_title':
            latestActivity['title'] ?? latestActivity['asset_name'] ?? '',
      };
      final payload = jsonEncode(payloadData);

      final androidDetails = AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDescription,
        importance: Importance.max,
        priority: Priority.high,
        icon: '@mipmap/launcher_icon',
        channelShowBadge: true,
        number: count,
        onlyAlertOnce: true,
        groupKey: _dailyControlNotificationGroupKey,
        setAsGroupSummary: true,
        groupAlertBehavior: GroupAlertBehavior.summary,
        autoCancel: false,
        ongoing: false,
        category: AndroidNotificationCategory.message,
        styleInformation: messagingStyle ??
            (lines.isEmpty
                ? null
                : InboxStyleInformation(
                    lines,
                    contentTitle: 'Chat Belum Dibaca',
                    summaryText: '$count item',
                  )),
      );

      await _localNotifications.show(
        _dailyControlSummaryNotificationId,
        'Daily Control',
        body,
        NotificationDetails(android: androidDetails),
        payload: payload,
      );
    } catch (e) {
      debugPrint('Failed to sync daily control summary notification: $e');
    }
  }

  Future<List<Map<String, dynamic>>> _loadDailyControlUnreadActivities({
    int limit = 6,
  }) async {
    try {
      final response = await _dailyControlRepository.getUnreadActivities(
        limit: limit,
      );
      final data = response['data'];
      if (data is! Map) {
        return const [];
      }

      final items = data['items'];
      if (items is! List) {
        return const [];
      }

      return items
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    } catch (e) {
      debugPrint('Failed to load daily control unread activities: $e');
      return const [];
    }
  }

  String _buildDailyControlPreviewLine(Map<String, dynamic> row) {
    final name = _dailyControlSenderName(row);
    final message = _dailyControlMessageText(row);
    if (message.isEmpty) {
      return '';
    }

    final compactMessage =
        message.length > 56 ? '${message.substring(0, 56)}...' : message;
    return name.isNotEmpty ? '$name: $compactMessage' : compactMessage;
  }

  MessagingStyleInformation? _buildDailyControlMessagingStyle(
    List<Map<String, dynamic>> activities,
    int totalUnread,
  ) {
    if (activities.isEmpty) {
      return null;
    }

    final conversationPerson = Person(
      name: 'Daily Control',
      key: 'daily_control_group',
      important: true,
    );

    final messages = <Message>[];
    for (final row in activities.reversed) {
      final text = _dailyControlMessageText(row);
      if (text.isEmpty) {
        continue;
      }

      final sender = _dailyControlSenderName(row);
      final senderPerson = Person(
        name: sender.isEmpty ? 'User' : sender,
        key: 'dc_sender_${row['id_user'] ?? row['created_by'] ?? sender}',
      );
      final sentAt = _parseDateTime(
        '${row['latest_unread_at'] ?? row['activity_date'] ?? ''}'.trim(),
      );

      messages.add(
        Message(
          text,
          sentAt,
          senderPerson,
        ),
      );
    }

    if (messages.isEmpty) {
      return null;
    }

    return MessagingStyleInformation(
      conversationPerson,
      groupConversation: true,
      conversationTitle: totalUnread > 1
          ? 'Daily Control ($totalUnread chat)'
          : 'Daily Control',
      messages: messages,
    );
  }

  String _dailyControlSenderName(Map<String, dynamic> row) {
    return '${row['latest_unread_sender'] ?? row['display_name'] ?? row['fullname'] ?? row['created_by'] ?? ''}'
        .trim();
  }

  String _dailyControlMessageText(Map<String, dynamic> row) {
    return '${row['latest_unread_message'] ?? row['notes'] ?? row['title'] ?? ''}'
        .trim()
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  DateTime _parseDateTime(String rawValue) {
    if (rawValue.isEmpty) {
      return DateTime.now();
    }

    return DateTime.tryParse(rawValue) ?? DateTime.now();
  }

  Future<List<int>> _getStoredDailyControlChildNotificationIds() async {
    final prefs = await SharedPreferences.getInstance();
    final rawValues =
        prefs.getStringList(_dailyControlChildNotificationIdsStorageKey) ??
            const <String>[];
    return rawValues
        .map((value) => int.tryParse(value) ?? 0)
        .where((value) => value > 0)
        .toList(growable: false);
  }

  Future<void> _storeDailyControlChildNotificationIds(List<int> ids) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _dailyControlChildNotificationIdsStorageKey,
      ids.map((id) => '$id').toList(growable: false),
    );
  }

  Future<void> _cancelDailyControlChildNotifications() async {
    final previousIds = await _getStoredDailyControlChildNotificationIds();
    for (final id in previousIds) {
      await _localNotifications.cancel(id);
    }
    await _storeDailyControlChildNotificationIds(const <int>[]);
  }

  Future<void> _showDailyControlThreadNotifications(
    List<Map<String, dynamic>> activities,
  ) async {
    await _cancelDailyControlChildNotifications();
    final notificationIds = <int>[];

    for (var index = 0; index < activities.length; index++) {
      final activity = activities[index];
      final dailyControlId = int.tryParse(
              '${activity['id'] ?? activity['daily_control_id'] ?? 0}') ??
          0;
      if (dailyControlId <= 0) {
        continue;
      }

      final message = _dailyControlMessageText(activity);
      if (message.isEmpty) {
        continue;
      }

      // Gunakan rentang ID khusus agar tidak bertabrakan dengan summary.
      final notificationId = 920000 + (dailyControlId % 70000);
      final payload = jsonEncode(<String, dynamic>{
        'type': 'daily_control_comment',
        'daily_control_id': dailyControlId,
        'activity_date': activity['activity_date'] ?? '',
        'activity_time': activity['activity_time'] ?? '',
        'sender_name': _dailyControlSenderName(activity),
        'latest_unread_message': message,
        'asset_name': activity['asset_name'] ?? '',
        'wo_number': activity['wo_number'] ?? '',
        'activity_title': activity['title'] ?? activity['asset_name'] ?? '',
      });
      final sender = _dailyControlSenderName(activity);
      final title = sender.isEmpty ? 'Daily Control' : sender;

      await _localNotifications.show(
        notificationId,
        title,
        message,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _dailyControlPreviewChannelId,
            _dailyControlPreviewChannelName,
            channelDescription: 'Unread Daily Control conversation previews',
            importance: Importance.max,
            priority: Priority.high,
            icon: '@mipmap/launcher_icon',
            channelShowBadge: false,
            groupKey: _dailyControlNotificationGroupKey,
            groupAlertBehavior: GroupAlertBehavior.summary,
            onlyAlertOnce: true,
            category: AndroidNotificationCategory.message,
          ),
        ),
        payload: payload,
      );
      notificationIds.add(notificationId);
    }

    await _storeDailyControlChildNotificationIds(notificationIds);
  }

  Future<int> _resolveDailyControlBadgeCount(Map<String, dynamic> data) async {
    final rawBadgeCount = data['badge_count']?.toString().trim() ?? '';
    final payloadBadgeCount = int.tryParse(rawBadgeCount);
    if (payloadBadgeCount != null && payloadBadgeCount >= 0) {
      return setDailyControlBadgeCount(payloadBadgeCount);
    }

    final current = await getDailyControlBadgeCount();
    return setDailyControlBadgeCount(current + 1);
  }

  Future<void> unregisterCurrentToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final authToken = prefs.getString('token');
      final currentToken =
          prefs.getString(_fcmTokenStorageKey) ?? await _messaging.getToken();

      if (authToken == null ||
          authToken.isEmpty ||
          currentToken == null ||
          currentToken.isEmpty) {
        return;
      }

      await _apiService.post(
        ApiConstants.unregisterDeviceToken,
        data: {
          'token': currentToken,
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $authToken',
          },
        ),
      );
    } catch (e) {
      debugPrint('FCM unregister failed: $e');
    }
  }

  Future<void> syncTokenWithBackend({
    String? previousTokenOverride,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final authToken = prefs.getString('token');

      if (authToken == null || authToken.isEmpty) {
        debugPrint('FCM sync skipped: auth token not available');
        return;
      }

      final fcmToken = await _messaging.getToken();
      if (fcmToken == null || fcmToken.isEmpty) {
        debugPrint('FCM sync skipped: FCM token not available');
        return;
      }

      final previousToken =
          previousTokenOverride ?? prefs.getString(_fcmTokenStorageKey);
      final packageInfo = await PackageInfo.fromPlatform();

      await _apiService.post(
        ApiConstants.registerDeviceToken,
        data: {
          'token': fcmToken,
          'previous_token': previousToken,
          'platform': Platform.operatingSystem,
          'device_name': _buildDeviceName(),
          'app_version': packageInfo.version,
          'build_number': packageInfo.buildNumber,
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $authToken',
          },
        ),
      );

      await _saveLocalToken(fcmToken);
      debugPrint('FCM token synced to backend');
    } catch (e) {
      debugPrint('FCM sync failed: $e');
    }
  }

  String _buildDeviceName() {
    final os = Platform.operatingSystem;
    final version = Platform.operatingSystemVersion;
    return '$os | $version';
  }

  Future<void> _saveLocalToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_fcmTokenStorageKey, token);
  }

  Map<String, dynamic> _parseNotificationPayloadString(String? rawPayload) {
    final raw = rawPayload?.trim() ?? '';
    if (raw.isEmpty) {
      return <String, dynamic>{};
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } catch (_) {
      debugPrint('Notification payload is not valid JSON');
    }

    return <String, dynamic>{};
  }

  Future<void> _handleNotificationNavigation(Map<String, dynamic> data) async {
    final type = data['type']?.toString().trim().toLowerCase() ?? '';
    if (type == 'app_update') {
      await _showUpdateDialogFromNotification(
        data,
        persistIfAppNotReady: true,
      );
      return;
    }

    if (type != 'daily_control_comment') {
      return;
    }

    await _navigateToTarget(data, persistIfAppNotReady: true);
  }

  Future<void> _showUpdateDialogFromNotification(
    Map<String, dynamic> data, {
    required bool persistIfAppNotReady,
  }) async {
    final hasNavigator = Get.key.currentContext != null;
    if (!hasNavigator) {
      if (persistIfAppNotReady) {
        await _savePendingNavigation({
          'type': 'app_update',
          ...data,
        });
      }
      return;
    }

    try {
      final updateProvider = Get.isRegistered<UpdateProvider>()
          ? Get.find<UpdateProvider>()
          : Get.put(UpdateProvider());

      await updateProvider.checkForUpdate();

      final forceUpdate = (data['force_update']?.toString().trim() == '1') ||
          (updateProvider.latestVersion.value?.forceUpdate ?? false);

      if (updateProvider.updateAvailable.value &&
          !(Get.isDialogOpen ?? false)) {
        Get.dialog(
          UpdateDialog(forceUpdate: forceUpdate),
          barrierDismissible: !forceUpdate,
        );
      }
    } catch (e) {
      debugPrint('Failed to open app update dialog from notification: $e');
    }
  }

  Future<void> _navigateToTarget(
    Map<String, dynamic> data, {
    required bool persistIfAppNotReady,
  }) async {
    final openUnreadList = data['open_unread_list'] == true;
    final dailyControlId =
        int.tryParse('${data['daily_control_id'] ?? 0}') ?? 0;
    if (!openUnreadList && dailyControlId <= 0) {
      return;
    }

    final activityDate = data['activity_date']?.toString().trim() ?? '';
    final targetPayload = <String, dynamic>{
      ...data,
      'daily_control_id': dailyControlId,
      'activity_date': activityDate,
      'from_notification': true,
    };

    final hasNavigator = Get.key.currentContext != null;
    if (!hasNavigator) {
      if (persistIfAppNotReady) {
        await _savePendingNavigation(targetPayload);
      }
      return;
    }

    if (Get.currentRoute == AppRoutes.dailyControl &&
        Get.isRegistered<DailyControlController>()) {
      final controller = Get.find<DailyControlController>();
      if (openUnreadList) {
        controller.requestOpenUnreadList();
        return;
      }
      controller.applyNotificationTarget(
        dailyControlId: dailyControlId,
        activityDate: activityDate,
        payload: targetPayload,
        shouldReload: false,
      );
      return;
    }

    Get.toNamed(
      AppRoutes.dailyControl,
      arguments: targetPayload,
    );
  }

  Future<void> _savePendingNavigation(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_pendingNavigationStorageKey, jsonEncode(data));
  }

  Future<Map<String, dynamic>> _takePendingNavigation() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pendingNavigationStorageKey)?.trim() ?? '';
    if (raw.isEmpty) {
      return <String, dynamic>{};
    }

    await prefs.remove(_pendingNavigationStorageKey);

    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } catch (_) {
      debugPrint('Pending notification navigation payload invalid');
    }

    return <String, dynamic>{};
  }

  void _emitMessageEvent(Map<String, dynamic> data) {
    if (data.isEmpty || _messageController.isClosed) {
      return;
    }

    try {
      _messageController.add(Map<String, dynamic>.from(data));
    } catch (e) {
      debugPrint('Failed to broadcast notification event: $e');
    }
  }
}
