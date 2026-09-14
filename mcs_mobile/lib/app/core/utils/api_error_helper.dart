import 'package:dio/dio.dart';

class ApiErrorHelper {
  static String toUserMessage(
    Object error, {
    String fallback = 'Terjadi kesalahan. Silakan coba lagi.',
  }) {
    if (error is DioException) {
      return _fromDio(error, fallback: fallback);
    }

    final raw = error.toString().replaceFirst('Exception: ', '').trim();
    if (raw.isEmpty || raw.toLowerCase() == 'null') {
      return fallback;
    }
    return raw;
  }

  static String _fromDio(
    DioException e, {
    required String fallback,
  }) {
    final data = e.response?.data;
    final statusCode = e.response?.statusCode;

    if (data is Map) {
      final message = _pickMapString(data, const ['message', 'error']);
      final requestId = _pickMapString(data, const ['request_id', 'requestId']);

      final cleanMessage = _normalize(message);
      if (cleanMessage.isNotEmpty) {
        if (requestId.isNotEmpty) {
          return '$cleanMessage\nRef: $requestId';
        }
        return cleanMessage;
      }
    }

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
        return 'Koneksi ke server timeout. Cek jaringan lalu coba lagi.';
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Server terlalu lama merespons. Silakan coba lagi.';
      case DioExceptionType.connectionError:
        return 'Tidak bisa terhubung ke server. Cek koneksi internet/VPN.';
      case DioExceptionType.badResponse:
        if (statusCode != null) {
          return 'Permintaan gagal (HTTP $statusCode). Silakan coba lagi.';
        }
        return fallback;
      case DioExceptionType.cancel:
        return 'Permintaan dibatalkan.';
      case DioExceptionType.unknown:
      case DioExceptionType.badCertificate:
        final msg = _normalize(e.message);
        return msg.isNotEmpty ? msg : fallback;
    }
  }

  static String _pickMapString(Map data, List<String> keys) {
    for (final key in keys) {
      if (data.containsKey(key)) {
        return _normalize(data[key]?.toString() ?? '');
      }
    }
    return '';
  }

  static String _normalize(String? text) {
    final value = (text ?? '').trim();
    if (value.isEmpty) return '';
    if (value.toLowerCase() == 'null') return '';
    return value;
  }
}
