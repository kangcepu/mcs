import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../constants/api_constants.dart';

/// Centralized, app-wide connection status.
///
/// A device can report "connected" to a Wi-Fi/mobile interface while the
/// backend is still unreachable (bad signal, captive portal, VPN down) —
/// field technicians hit this a lot. So this does two checks, not one:
/// 1. Any network interface present at all (via `connectivity_plus`).
/// 2. The backend actually answers (a lightweight `/health` ping).
/// `isOnline` only ever reflects #2, which is what the user can act on.
class ConnectivityService extends GetxService {
  final isOnline = true.obs;

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  Timer? _pollTimer;
  late final Dio _pingDio;

  Future<ConnectivityService> init() async {
    _pingDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 4),
      receiveTimeout: const Duration(seconds: 4),
    ));

    final initial = await _connectivity.checkConnectivity();
    await _handleConnectivityChange(initial);

    _subscription =
        _connectivity.onConnectivityChanged.listen(_handleConnectivityChange);
    _pollTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _checkReachability(),
    );
    return this;
  }

  Future<void> _handleConnectivityChange(List<ConnectivityResult> results) async {
    final hasInterface = results.any((r) => r != ConnectivityResult.none);
    if (!hasInterface) {
      isOnline.value = false;
      return;
    }
    await _checkReachability();
  }

  Future<void> _checkReachability() async {
    try {
      final response = await _pingDio.get('${ApiConstants.baseUrl}/v2/health');
      isOnline.value = response.statusCode != null && response.statusCode! < 500;
    } catch (_) {
      isOnline.value = false;
    }
  }

  /// Lets a widget (e.g. tapping the offline banner) force an immediate
  /// re-check instead of waiting for the next 15s poll.
  Future<void> checkNow() => _checkReachability();

  @override
  void onClose() {
    _subscription?.cancel();
    _pollTimer?.cancel();
    super.onClose();
  }
}
