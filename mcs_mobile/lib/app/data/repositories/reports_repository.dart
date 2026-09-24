import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/constants/api_constants.dart';
import '../../core/utils/api_error_helper.dart';
import '../providers/api_service.dart';

class ReportPage {
  final List<Map<String, dynamic>> rows;
  final int page;
  final int perPage;
  final int total;
  final int totalPages;

  const ReportPage({
    required this.rows,
    required this.page,
    required this.perPage,
    required this.total,
    required this.totalPages,
  });

  bool get hasMore => page < totalPages;
}

class ReportsRepository {
  final ApiService _api = ApiService();

  static Map<String, dynamic> _clean(Map<String, dynamic> params) => {
        for (final e in params.entries)
          if (e.value != null && '${e.value}'.trim().isNotEmpty) e.key: e.value,
      };

  Future<ReportPage> fetch(
    String report,
    Map<String, dynamic> params, {
    int page = 1,
    int perPage = 50,
  }) async {
    try {
      final response = await _api.get(
        '${ApiConstants.reports}/$report',
        queryParameters: {..._clean(params), 'page': page, 'per_page': perPage},
      );
      final body = response.data;
      if (body is! Map || body['success'] != true) {
        throw Exception(body is Map ? body['message'] : 'Respons tidak valid');
      }
      final data = body['data'];
      final rows = data is List
          ? data
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : <Map<String, dynamic>>[];
      final meta = body['meta'] is Map ? body['meta'] as Map : const {};
      int asInt(dynamic v, int d) => int.tryParse('$v') ?? d;
      return ReportPage(
        rows: rows,
        page: asInt(meta['page'], page),
        perPage: asInt(meta['per_page'], perPage),
        total: asInt(meta['total'], rows.length),
        totalPages: asInt(meta['total_pages'], 1),
      );
    } catch (e) {
      throw Exception(ApiErrorHelper.toUserMessage(
        e,
        fallback: 'Gagal memuat laporan. Silakan coba lagi.',
      ));
    }
  }

  Future<ReportPage> assets({
    String q = '',
    int page = 1,
    int perPage = 15,
    bool activeOnly = false,
  }) async {
    try {
      final response = await _api.get(
        ApiConstants.assets,
        queryParameters: {
          if (q.trim().isNotEmpty) 'q': q.trim(),
          if (activeOnly) 'is_active': '1',
          'page': page,
          'per_page': perPage,
        },
      );
      final body = response.data;
      if (body is! Map || body['success'] != true) {
        throw Exception(body is Map ? body['message'] : 'Respons tidak valid');
      }
      final data = body['data'];
      final rows = data is List
          ? data
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : <Map<String, dynamic>>[];
      final meta = body['meta'] is Map ? body['meta'] as Map : const {};
      int asInt(dynamic v, int d) => int.tryParse('$v') ?? d;
      return ReportPage(
        rows: rows,
        page: asInt(meta['page'], page),
        perPage: asInt(meta['per_page'], perPage),
        total: asInt(meta['total'], rows.length),
        totalPages: asInt(meta['total_pages'], 1),
      );
    } catch (e) {
      throw Exception(ApiErrorHelper.toUserMessage(
        e,
        fallback: 'Gagal memuat daftar asset.',
      ));
    }
  }

  Future<Map<String, dynamic>> recapOptions() async {
    try {
      final response =
          await _api.get('${ApiConstants.reports}/recap-work-orders-options');
      final body = response.data;
      if (body is Map && body['success'] == true && body['data'] is Map) {
        return Map<String, dynamic>.from(body['data'] as Map);
      }
      return {};
    } catch (e) {
      throw Exception(ApiErrorHelper.toUserMessage(
        e,
        fallback: 'Gagal memuat opsi filter.',
      ));
    }
  }

  Future<Map<String, dynamic>> qr(String assetCode) async {
    try {
      final response = await _api.get(
        '${ApiConstants.reports}/qr',
        queryParameters: {'asset_code': assetCode},
      );
      final body = response.data;
      if (body is Map && body['success'] == true && body['data'] is Map) {
        return Map<String, dynamic>.from(body['data'] as Map);
      }
      throw Exception('QR tidak ditemukan');
    } catch (e) {
      throw Exception(ApiErrorHelper.toUserMessage(
        e,
        fallback: 'Gagal memuat QR asset.',
      ));
    }
  }

  /// Unduh hasil export (xlsx/pdf) dari backend lalu buka dengan aplikasi
  /// bawaan perangkat.
  Future<void> downloadAndOpen(
    String report,
    Map<String, dynamic> params, {
    required String format,
    required String fileName,
  }) async {
    try {
      final response = await _api.get(
        '${ApiConstants.reports}/$report/export',
        queryParameters: {..._clean(params), 'format': format},
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = response.data;
      if (bytes is! List<int> || bytes.isEmpty) {
        throw Exception('File laporan kosong');
      }
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$fileName.$format');
      await file.writeAsBytes(bytes, flush: true);
      final result = await OpenFile.open(file.path);
      if (result.type != ResultType.done) {
        throw Exception(
            'Tidak ada aplikasi untuk membuka file .$format (${result.message})');
      }
    } catch (e) {
      throw Exception(ApiErrorHelper.toUserMessage(
        e,
        fallback: 'Gagal mengunduh laporan. Silakan coba lagi.',
      ));
    }
  }
}
