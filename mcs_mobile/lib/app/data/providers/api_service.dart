import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart' hide Response;
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants/api_constants.dart';
import '../../core/routes/app_routes.dart';
import '../../core/services/realtime_service.dart';

class ApiService {
  late final Dio _dio;
  static final ApiService _instance = ApiService._internal();
  static bool _handlingSessionExpiry = false;
  static int _activeRequestCount = 0;
  static final ValueNotifier<int> activeRequests = ValueNotifier<int>(0);
  static final ValueNotifier<DateTime?> lastSuccessfulSync =
      ValueNotifier<DateTime?>(null);

  factory ApiService() {
    return _instance;
  }

  ApiService._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: ApiConstants.connectTimeout,
        receiveTimeout: ApiConstants.receiveTimeout,
        headers: const {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          _activeRequestCount += 1;
          activeRequests.value = _activeRequestCount;
          final prefs = await SharedPreferences.getInstance();
          final token = prefs.getString('token');

          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          options.headers['Cache-Control'] =
              'no-cache, no-store, must-revalidate';
          options.headers['Pragma'] = 'no-cache';
          options.headers['Expires'] = '0';

          if (ApiConstants.enableHttpLog) {
            // ignore: avoid_print
            print('REQUEST[${options.method}] PATH: ${options.path}');
          }
          return handler.next(options);
        },
        onResponse: (response, handler) {
          final data = response.data;
          if (data is String) {
            final lower = data.toLowerCase();
            if (lower.contains('<!doctype') || lower.contains('<html')) {
              _finishRequest(success: false);
              return handler.reject(
                DioException(
                  requestOptions: response.requestOptions,
                  response: response,
                  type: DioExceptionType.badResponse,
                  error: 'Server returned HTML instead of JSON',
                ),
              );
            }
          }

          if (ApiConstants.enableHttpLog) {
            // ignore: avoid_print
            print(
              'RESPONSE[${response.statusCode}] PATH: ${response.requestOptions.path}',
            );
          }
          _finishRequest(success: true);
          return handler.next(response);
        },
        onError: (DioException e, handler) {
          _finishRequest(success: false);
          if (ApiConstants.enableHttpLog) {
            // ignore: avoid_print
            print(
              'ERROR[${e.response?.statusCode}] PATH: ${e.requestOptions.path}',
            );
            // ignore: avoid_print
            print('MESSAGE: ${e.message}');
          }
          final hadAuthHeader =
              e.requestOptions.headers['Authorization'] != null;
          final isReportCenterRequest =
              e.requestOptions.path.contains('/report-center/');
          if (e.response?.statusCode == 401 &&
              hadAuthHeader &&
              !isReportCenterRequest) {
            unawaited(_handleSessionExpired());
          }
          return handler.next(e);
        },
      ),
    );
  }

  Dio get dio => _dio;

  static void _finishRequest({required bool success}) {
    _activeRequestCount = (_activeRequestCount - 1).clamp(0, 1 << 30);
    activeRequests.value = _activeRequestCount;
    if (success) lastSuccessfulSync.value = DateTime.now();
  }

  static Future<void> _handleSessionExpired() async {
    if (_handlingSessionExpiry) return;
    final prefs = await SharedPreferences.getInstance();
    if ((prefs.getString('token') ?? '').isEmpty) return;
    _handlingSessionExpiry = true;
    try {
      RealtimeService.stopIfAvailable();
      await prefs.remove('token');
      await prefs.remove('user_data');
      if (Get.currentRoute != AppRoutes.login) {
        Get.offAllNamed(AppRoutes.login);
        Get.snackbar(
          'Sesi Berakhir',
          'Silakan login kembali untuk melanjutkan.',
          snackPosition: SnackPosition.BOTTOM,
        );
      }
    } finally {
      _handlingSessionExpiry = false;
    }
  }

  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    final mergedQueryParameters = <String, dynamic>{
      if (queryParameters != null) ...queryParameters,
      '_ts': DateTime.now().millisecondsSinceEpoch.toString(),
    };

    return _dio.get(
      path,
      queryParameters: mergedQueryParameters,
      options: options,
    );
  }

  Future<Response> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return _dio.post(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }

  Future<Response> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return _dio.put(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }

  Future<Response> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return _dio.patch(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }

  Future<Response> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return _dio.delete(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }
}
