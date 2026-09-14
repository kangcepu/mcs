import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/core/constants/api_constants.dart';
import 'package:mcs_mobile/app/modules/daily_control/controllers/daily_control_controller.dart';

void main() {
  tearDown(_usePublicUrls);

  test('rewrites a LAN media URL to the selected public web origin', () {
    _usePublicUrls();

    final media = DailyControlMedia.fromJson({
      'id': 1,
      'media_type': 'image',
      'media_url':
          'http://192.168.10.100:8888/mcs/assets/docs/wo_service_evidence/photo.jpg',
    });

    expect(
      media.mediaUrl,
      'https://mcs.padmoasm.com/assets/docs/wo_service_evidence/photo.jpg',
    );
  });

  test('keeps the application prefix once when using the local web origin', () {
    ApiConstants.setUrls(
      mcsBaseUrl: 'http://192.168.10.100:8888/mcs/api',
      mcsWebBaseUrl: 'http://192.168.10.100:8888/mcs',
      soBaseUrl: 'http://192.168.10.100:6000',
      soWsUrl: 'ws://192.168.10.100:6000',
    );

    final media = DailyControlMedia.fromJson({
      'id': 1,
      'media_type': 'image',
      'media_url':
          'http://192.168.10.100:8888/mcs/assets/docs/wo_service_evidence/photo.jpg',
    });

    expect(
      media.mediaUrl,
      'http://192.168.10.100:8888/mcs/assets/docs/wo_service_evidence/photo.jpg',
    );
  });

  test('upgrades an HTTP public media URL to HTTPS', () {
    _usePublicUrls();

    final media = DailyControlMedia.fromJson({
      'id': 1,
      'media_type': 'image',
      'media_url':
          'http://mcs.padmoasm.com/assets/docs/wo_service_evidence/photo.jpg',
    });

    expect(
      media.mediaUrl,
      'https://mcs.padmoasm.com/assets/docs/wo_service_evidence/photo.jpg',
    );
  });
}

void _usePublicUrls() {
  ApiConstants.setUrls(
    mcsBaseUrl: 'https://mcs.padmoasm.com/api',
    mcsWebBaseUrl: 'https://mcs.padmoasm.com',
    soBaseUrl: 'https://so.padmoasm.com',
    soWsUrl: 'wss://so.padmoasm.com',
  );
}
