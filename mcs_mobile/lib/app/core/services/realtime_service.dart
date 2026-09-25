import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/api_constants.dart';

class RealtimeEvent {
  final int id;
  final List<String> topics;
  final String? module;
  final String? woNumber;
  final String source;

  const RealtimeEvent({
    required this.id,
    required this.topics,
    this.module,
    this.woNumber,
    this.source = 'api',
  });

  bool get isResync => source == 'resync';

  bool matches(Iterable<String> wanted) {
    if (isResync) return true;
    for (final topic in wanted) {
      if (topics.contains(topic)) return true;
    }
    return false;
  }
}

class RealtimeService extends GetxService with WidgetsBindingObserver {
  static RealtimeService get to => Get.find<RealtimeService>();

  static void startIfAvailable() {
    if (Get.isRegistered<RealtimeService>()) to.ensureStarted();
  }

  static void stopIfAvailable() {
    if (Get.isRegistered<RealtimeService>()) to.stop();
  }

  static const Duration _watchdog = Duration(seconds: 45);
  static const Duration _minBackoff = Duration(seconds: 1);
  static const Duration _maxBackoff = Duration(seconds: 30);

  final StreamController<RealtimeEvent> _events =
      StreamController<RealtimeEvent>.broadcast();
  final RxBool connected = false.obs;

  bool _wanted = false;
  bool _paused = false;
  bool _running = false;
  Completer<void>? _wake;
  bool _hadConnection = false;
  CancelToken? _cancel;
  Timer? _watchdogTimer;
  int _syntheticId = 0;

  Stream<RealtimeEvent> get events => _events.stream;

  Stream<RealtimeEvent> on(Iterable<String> topics) {
    final wanted = topics.toList();
    return _events.stream.where((event) => event.matches(wanted));
  }

  @override
  void onInit() {
    super.onInit();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void onClose() {
    WidgetsBinding.instance.removeObserver(this);
    _teardown();
    _events.close();
    super.onClose();
  }

  Future<void> ensureStarted() async {
    if (_wanted) return;
    final prefs = await SharedPreferences.getInstance();
    if ((prefs.getString('token') ?? '').isEmpty) return;
    _wanted = true;
    _hadConnection = false;
    unawaited(_loop());
  }

  void stop() {
    _wanted = false;
    _hadConnection = false;
    _teardown();
    _kick();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_wanted) return;
    if (state == AppLifecycleState.resumed) {
      _paused = false;
      _teardown();
      if (_running) {
        _kick();
      } else {
        unawaited(_loop());
      }
    } else if (state == AppLifecycleState.paused) {
      _paused = true;
      _teardown();
    }
  }

  void _kick() {
    final wake = _wake;
    if (wake != null && !wake.isCompleted) wake.complete();
  }

  void _teardown() {
    _watchdogTimer?.cancel();
    _watchdogTimer = null;
    _cancel?.cancel('realtime teardown');
    _cancel = null;
    connected.value = false;
  }

  void _armWatchdog() {
    _watchdogTimer?.cancel();
    _watchdogTimer = Timer(_watchdog, () {
      _cancel?.cancel('realtime watchdog');
    });
  }

  Future<void> _loop() async {
    if (_running) return;
    _running = true;
    var backoff = _minBackoff;
    try {
      while (_wanted) {
        if (_paused) {
          _wake = Completer<void>();
          await _wake!.future;
          continue;
        }
        final startedAt = DateTime.now();
        final ok = await _connectOnce();
        connected.value = false;
        if (!_wanted || !ok) break;
        if (_paused) continue;
        final ranFor = DateTime.now().difference(startedAt);
        final next = ranFor > const Duration(seconds: 20)
            ? _minBackoff
            : Duration(
                milliseconds: backoff.inMilliseconds * 2 > _maxBackoff.inMilliseconds
                    ? _maxBackoff.inMilliseconds
                    : backoff.inMilliseconds * 2,
              );
        backoff = next;
        _wake = Completer<void>();
        await Future.any<void>([Future<void>.delayed(backoff), _wake!.future]);
      }
    } finally {
      _running = false;
    }
  }

  Future<bool> _connectOnce() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token') ?? '';
    if (token.isEmpty) {
      _wanted = false;
      return false;
    }

    final cancel = CancelToken();
    _cancel = cancel;
    final dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: Duration.zero,
        responseType: ResponseType.stream,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Authorization': 'Bearer $token',
        },
      ),
    );

    try {
      final response = await dio.get<ResponseBody>(
        '/v2/realtime/stream',
        cancelToken: cancel,
      );
      final body = response.data;
      if (body == null) return true;

      _armWatchdog();
      var eventName = '';
      final dataBuffer = StringBuffer();

      final lines = utf8.decoder
          .bind(body.stream)
          .transform(const LineSplitter());
      await for (final line in lines) {
        _armWatchdog();
        if (line.isEmpty) {
          if (dataBuffer.isNotEmpty) {
            _dispatch(eventName, dataBuffer.toString());
          }
          eventName = '';
          dataBuffer.clear();
        } else if (line.startsWith('event:')) {
          eventName = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          if (dataBuffer.isNotEmpty) dataBuffer.write('\n');
          dataBuffer.write(line.substring(5).trimLeft());
        }
      }
      return true;
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) return true;
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        _wanted = false;
        return false;
      }
      return true;
    } catch (_) {
      return true;
    } finally {
      dio.close(force: true);
      _watchdogTimer?.cancel();
    }
  }

  void _dispatch(String name, String data) {
    if (name == 'ready') {
      connected.value = true;
      if (_hadConnection) {
        _syntheticId += 1;
        _events.add(RealtimeEvent(
          id: -_syntheticId,
          topics: const ['*'],
          source: 'resync',
        ));
      }
      _hadConnection = true;
      return;
    }
    if (name != 'change') return;
    try {
      final json = jsonDecode(data);
      if (json is! Map) return;
      final topics = json['topics'];
      _events.add(RealtimeEvent(
        id: int.tryParse('${json['id']}') ?? 0,
        topics: topics is List ? topics.map((e) => '$e').toList() : const [],
        module: json['module']?.toString(),
        woNumber: json['wo_number']?.toString(),
        source: json['source']?.toString() ?? 'api',
      ));
    } catch (_) {}
  }
}

class RealtimeSubscription {
  final Iterable<String> topics;
  final Future<void> Function() onChange;
  final Duration debounce;
  final bool Function(RealtimeEvent event)? where;

  StreamSubscription<RealtimeEvent>? _sub;
  Timer? _timer;
  bool _refreshing = false;
  bool _queued = false;

  RealtimeSubscription({
    required this.topics,
    required this.onChange,
    this.debounce = const Duration(milliseconds: 400),
    this.where,
  }) {
    if (!Get.isRegistered<RealtimeService>()) return;
    _sub = RealtimeService.to.on(topics).listen((event) {
      if (where == null || event.isResync || where!(event)) _schedule();
    });
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer(debounce, _run);
  }

  Future<void> _run() async {
    if (_refreshing) {
      _queued = true;
      return;
    }
    _refreshing = true;
    try {
      await onChange();
    } catch (_) {
    } finally {
      _refreshing = false;
      if (_queued) {
        _queued = false;
        _schedule();
      }
    }
  }

  void dispose() {
    _timer?.cancel();
    _sub?.cancel();
  }
}

mixin RealtimeRefresh on GetxController {
  RealtimeSubscription? _realtime;

  void bindRealtime(
    Iterable<String> topics,
    Future<void> Function() refresh, {
    Duration debounce = const Duration(milliseconds: 400),
    bool Function(RealtimeEvent event)? where,
  }) {
    _realtime?.dispose();
    _realtime = RealtimeSubscription(
      topics: topics,
      onChange: refresh,
      debounce: debounce,
      where: where,
    );
  }

  @override
  void onClose() {
    _realtime?.dispose();
    _realtime = null;
    super.onClose();
  }
}
