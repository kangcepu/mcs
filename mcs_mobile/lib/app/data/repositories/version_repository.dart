import 'package:dio/dio.dart';
import '../models/app_version_model.dart';
import '../../core/constants/api_constants.dart';

class VersionRepository {
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: ApiConstants.connectTimeout,
      receiveTimeout: ApiConstants.receiveTimeout,
      headers: const {
        'Accept': 'application/json',
      },
    ),
  );

  String get _versionUrl => '${ApiConstants.baseUrl}${ApiConstants.mobileRelease}';

  Future<AppVersionModel> getLatestVersion() async {
    try {
      final response = await _dio.get(
        _versionUrl,
        queryParameters: {
          '_ts': DateTime.now().millisecondsSinceEpoch,
        },
        options: Options(
          headers: const {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
        ),
      );
      final raw = response.data;
      if (raw is! Map || raw['data'] is! Map) {
        throw Exception('Invalid version payload');
      }

      final model = AppVersionModel.fromJson(
        Map<String, dynamic>.from(raw['data'] as Map),
      );
      final normalizedUrl = _normalizeDownloadUrl(model.downloadUrl);
      if (normalizedUrl != model.downloadUrl) {
        return AppVersionModel(
          version: model.version,
          downloadUrl: normalizedUrl,
          releaseNotes: model.releaseNotes,
          forceUpdate: model.forceUpdate,
          versionCode: model.versionCode,
        );
      }
      return model;
    } catch (e) {
      throw Exception('Failed to fetch version info: $e');
    }
  }

  Future<String> downloadApk(
    String url,
    String savePath,
    Function(int, int)? onProgress,
  ) async {
    try {
      // Large APK downloads can take longer than standard API requests.
      _dio.options.receiveTimeout = const Duration(minutes: 5);
      await _dio.download(
        url,
        savePath,
        options: Options(followRedirects: true),
        onReceiveProgress: onProgress,
      );
      return savePath;
    } catch (e) {
      throw Exception('Failed to download APK: $e');
    }
  }

  String _normalizeDownloadUrl(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return value;

    final uri = Uri.tryParse(value);
    if (uri == null) return value;

    // Backend baru mengembalikan path relatif (mis. `/uploads/downloads/x.apk`)
    // yang disajikan dari origin API yang sama, bukan dari web base legacy.
    if (!uri.hasScheme || uri.host.isEmpty) {
      final apiOrigin = Uri.tryParse(ApiConstants.baseUrl);
      if (apiOrigin == null) return value;
      return apiOrigin.replace(
        path: uri.path,
        query: uri.query.isEmpty ? null : uri.query,
      ).toString();
    }

    // If the backend returns an internal/private URL, rewrite it to the public web base.
    if (_isPrivateHost(uri.host)) {
      final webBase = Uri.tryParse(ApiConstants.webBaseUrl);
      if (webBase == null) return value;

      final path = uri.path;
      // Common legacy path: http://<ip>:<port>/mcs/downloads/<file>.apk
      if (path.contains('/mcs/')) {
        final idx = path.indexOf('/mcs/');
        final newPath = path.substring(idx);
        return webBase.replace(path: newPath, query: uri.query).toString();
      }

      // Fallback: keep only filename under /downloads
      final filename = path.split('/').where((s) => s.isNotEmpty).lastOrNull;
      if (filename != null && filename.isNotEmpty) {
        return webBase.replace(path: '/downloads/$filename').toString();
      }
    }

    return value;
  }

  bool _isPrivateHost(String host) {
    final normalized = host.trim().toLowerCase();
    if (normalized.isEmpty) return false;
    if (normalized == 'localhost' ||
        normalized == '127.0.0.1' ||
        normalized == '::1' ||
        normalized == '10.0.2.2') {
      return true;
    }

    final segments = normalized.split('.');
    if (segments.length != 4) return false;
    final octets = segments.map(int.tryParse).toList(growable: false);
    if (octets.any((v) => v == null || v < 0 || v > 255)) return false;

    final a = octets[0]!;
    final b = octets[1]!;

    if (a == 10) return true;
    if (a == 172 && b >= 16 && b <= 31) return true;
    if (a == 192 && b == 168) return true;

    return false;
  }
}

extension _IterableLastOrNull<T> on Iterable<T> {
  T? get lastOrNull => isEmpty ? null : last;
}
