import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/core/constants/api_constants.dart';

void main() {
  tearDown(_useLocalBackendUrls);

  test('resolves a relative /uploads path against the API origin', () {
    _useLocalBackendUrls();

    expect(
      ApiConstants.mediaUrl('/uploads/wo_ga/xxx.jpg'),
      'http://127.0.0.1:3000/uploads/wo_ga/xxx.jpg',
    );
  });

  test('resolves a relative path without a leading slash', () {
    _useLocalBackendUrls();

    expect(
      ApiConstants.mediaUrl('uploads/wo_ga/xxx.jpg'),
      'http://127.0.0.1:3000/uploads/wo_ga/xxx.jpg',
    );
  });

  test('returns an already-absolute URL unchanged', () {
    _useLocalBackendUrls();

    expect(
      ApiConstants.mediaUrl('https://mcs.padmoasm.com/uploads/x.jpg'),
      'https://mcs.padmoasm.com/uploads/x.jpg',
    );
  });

  test('returns empty string for null or blank input', () {
    _useLocalBackendUrls();

    expect(ApiConstants.mediaUrl(null), '');
    expect(ApiConstants.mediaUrl(''), '');
    expect(ApiConstants.mediaUrl('   '), '');
  });

  test('apiOrigin keeps a legacy app-root prefix like /mcs', () {
    ApiConstants.setUrls(
      mcsBaseUrl: 'http://192.168.10.100:8888/mcs/api',
      mcsWebBaseUrl: 'http://192.168.10.100:8888/mcs',
      soBaseUrl: 'http://192.168.10.100:6000',
      soWsUrl: 'ws://192.168.10.100:6000',
    );

    expect(ApiConstants.apiOrigin, 'http://192.168.10.100:8888/mcs');
  });

  test('apiOrigin is bare origin for the new backend (no /mcs prefix)', () {
    _useLocalBackendUrls();

    expect(ApiConstants.apiOrigin, 'http://127.0.0.1:3000');
  });

  test('getAvatarUrl resolves a legacy bare filename against the web base',
      () {
    ApiConstants.setUrls(
      mcsBaseUrl: 'http://127.0.0.1:3000/api',
      mcsWebBaseUrl: 'https://mcs.padmoasm.com',
      soBaseUrl: 'https://so.padmoasm.com',
      soWsUrl: 'wss://so.padmoasm.com',
    );

    expect(
      ApiConstants.getAvatarUrl('1.png'),
      'https://mcs.padmoasm.com/assets/img/profile/1.png',
    );
  });

  test('getAvatarUrl resolves a new-backend relative path via the API origin',
      () {
    _useLocalBackendUrls();

    expect(
      ApiConstants.getAvatarUrl('uploads/avatars/u1_abcd.jpg'),
      'http://127.0.0.1:3000/uploads/avatars/u1_abcd.jpg',
    );
  });

  test('getAvatarUrl returns empty string for null or blank filename', () {
    _useLocalBackendUrls();

    expect(ApiConstants.getAvatarUrl(null), '');
    expect(ApiConstants.getAvatarUrl(''), '');
  });
}

void _useLocalBackendUrls() {
  ApiConstants.setUrls(
    mcsBaseUrl: 'http://127.0.0.1:3000/api',
    mcsWebBaseUrl: 'http://192.168.10.100:8888/mcs',
    soBaseUrl: 'https://so.padmoasm.com',
    soWsUrl: 'wss://so.padmoasm.com',
  );
}
