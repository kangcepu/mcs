import 'dart:io';

import 'package:package_info_plus/package_info_plus.dart';

import '../../core/constants/api_constants.dart';
import '../providers/api_service.dart';

class DeviceTokenRepository {
  final ApiService _apiService = ApiService();

  Future<void> registerDeviceToken({
    required String token,
    String? previousToken,
  }) async {
    final packageInfo = await PackageInfo.fromPlatform();

    await _apiService.post(
      ApiConstants.registerDeviceToken,
      data: {
        'token': token,
        'previous_token': previousToken ?? '',
        'platform': Platform.isAndroid
            ? 'android'
            : Platform.isIOS
                ? 'ios'
                : Platform.operatingSystem,
        'app_version': packageInfo.version,
        'build_number': packageInfo.buildNumber,
        'device_name':
            '${Platform.operatingSystem} ${Platform.operatingSystemVersion}',
      },
    );
  }

  Future<void> unregisterDeviceToken({
    required String token,
  }) async {
    await _apiService.post(
      ApiConstants.unregisterDeviceToken,
      data: {
        'token': token,
      },
    );
  }
}
