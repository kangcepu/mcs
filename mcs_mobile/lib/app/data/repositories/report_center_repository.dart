import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../core/utils/api_error_helper.dart';
import '../providers/api_service.dart';

class ExternalReportItem {
  final String id;
  final int endpointId;
  final String title;
  final String description;
  final String category;
  final String format;
  final String reportType;
  final String protocol;
  final List<String> params;

  const ExternalReportItem({
    required this.id,
    required this.endpointId,
    required this.title,
    required this.description,
    required this.category,
    required this.format,
    required this.reportType,
    required this.protocol,
    required this.params,
  });

  factory ExternalReportItem.fromJson(Map<String, dynamic> json) {
    return ExternalReportItem(
      id: '${json['id'] ?? ''}',
      endpointId: int.tryParse('${json['endpoint_id'] ?? 0}') ?? 0,
      title: '${json['title'] ?? 'Report'}',
      description: '${json['description'] ?? ''}',
      category: '${json['category'] ?? 'General'}',
      format: '${json['format'] ?? 'PDF'}'.toUpperCase(),
      reportType: '${json['report_type'] ?? ''}',
      protocol: '${json['protocol'] ?? 'ASYNC_JOB'}',
      params: json['params'] is List
          ? (json['params'] as List)
              .map((item) => '$item'.trim())
              .where((item) => item.isNotEmpty)
              .toList()
          : const [],
    );
  }
}

class ReportFilterOptions {
  final List<Map<String, String>> companies;
  final List<Map<String, String>> locations;
  final List<Map<String, String>> categories;
  final List<Map<String, String>> statuses;
  final List<Map<String, String>> types;
  final List<Map<String, String>> priorities;
  final List<Map<String, String>> shifts;
  final List<Map<String, String>> divisions;
  final int? matchedAssets;

  const ReportFilterOptions({
    this.companies = const [],
    this.locations = const [],
    this.categories = const [],
    this.statuses = const [],
    this.types = const [],
    this.priorities = const [],
    this.shifts = const [],
    this.divisions = const [],
    this.matchedAssets,
  });

  factory ReportFilterOptions.fromJson(Map<String, dynamic> json) {
    List<Map<String, String>> options(dynamic value) => value is List
        ? value.whereType<Map>().map((item) {
            final map = Map<String, dynamic>.from(item);
            return {
              'value': '${map['value'] ?? ''}',
              'label': '${map['label'] ?? map['value'] ?? ''}',
            };
          }).toList()
        : const [];
    return ReportFilterOptions(
      companies: options(json['companies']),
      locations: options(json['locations']),
      categories: options(json['categories']),
      statuses: options(json['statuses']),
      types: options(json['types']),
      priorities: options(json['priorities']),
      shifts: options(json['shifts']),
      divisions: options(json['divisions']),
      matchedAssets: json['matched_assets'] == null
          ? null
          : int.tryParse('${json['matched_assets']}'),
    );
  }
}

class GeneratedReport {
  final Uint8List bytes;
  final String filename;
  const GeneratedReport(this.bytes, this.filename);
}

class ReportCenterRepository {
  final ApiService _api = ApiService();
  static const String _base = '/v2/report-center';

  Map<String, dynamic> _data(Response response) {
    final body = response.data;
    if (body is Map && body['success'] == true && body['data'] is Map) {
      return Map<String, dynamic>.from(body['data'] as Map);
    }
    throw Exception(
        body is Map ? body['message'] : 'Respons report tidak valid.');
  }

  Future<List<ExternalReportItem>> catalog() async {
    try {
      final response = await _api.get('$_base/catalog');
      final data = _data(response);
      final reports = data['reports'];
      if (reports is! List) return const [];
      return reports
          .whereType<Map>()
          .map((item) =>
              ExternalReportItem.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } catch (error) {
      throw Exception(ApiErrorHelper.toUserMessage(error,
          fallback: 'Gagal memuat Report Center.'));
    }
  }

  Future<ReportFilterOptions> filterOptions(
    ExternalReportItem report,
    Map<String, String> params,
  ) async {
    try {
      final response = await _api.get(
        '$_base/filters/${report.endpointId}/${Uri.encodeComponent(report.id)}',
        queryParameters: params,
      );
      return ReportFilterOptions.fromJson(_data(response));
    } catch (error) {
      throw Exception(ApiErrorHelper.toUserMessage(error,
          fallback: 'Gagal memuat pilihan filter.'));
    }
  }

  Future<GeneratedReport> generate(
    ExternalReportItem report,
    Map<String, String> params, {
    required void Function(int? progress, String status) onProgress,
  }) async {
    try {
      if (report.protocol != 'ASYNC_JOB') {
        return await _download(
            '$_base/run/${report.endpointId}/${Uri.encodeComponent(report.id)}',
            report);
      }
      final created = await _api.post(
        '$_base/jobs/${report.endpointId}/${Uri.encodeComponent(report.id)}',
        // Job reporting terikat ke token yang membuatnya. Tablet tidak boleh
        // memakai ulang job web walaupun user dan filternya sama.
        data: {'params': params, 'force_new': true},
      );
      final job = _data(created);
      final localId = int.tryParse('${job['id'] ?? 0}') ?? 0;
      if (localId < 1) throw Exception('ID job report tidak valid.');
      onProgress(0, '${job['status'] ?? 'QUEUED'}');
      if (job['ready'] == true) {
        onProgress(100, 'COMPLETED');
        return await _download('$_base/jobs/$localId/download', report);
      }

      for (var attempt = 0; attempt < 12; attempt++) {
        if (attempt > 0) await Future<void>.delayed(const Duration(seconds: 5));
        final checked = await _api.get('$_base/jobs/$localId');
        final status = _data(checked);
        final upstream = status['response'] is Map
            ? Map<String, dynamic>.from(status['response'] as Map)
            : const <String, dynamic>{};
        final progress = int.tryParse('${upstream['progress'] ?? ''}');
        final statusText = '${status['status'] ?? 'PROCESSING'}'.toUpperCase();
        onProgress(progress, statusText);
        if (status['ready'] == true) {
          return await _download('$_base/jobs/$localId/download', report);
        }
        if (const ['FAILED', 'ERROR', 'CANCELLED', 'CANCELED']
            .contains(statusText)) {
          final detail =
              '${upstream['error'] ?? upstream['message'] ?? ''}'.trim();
          throw Exception(detail.isEmpty
              ? 'Pembuatan report gagal dengan status $statusText.'
              : detail);
        }
      }
      throw Exception(
          'Reporting belum menyelesaikan dokumen setelah 60 detik. Silakan coba kembali.');
    } catch (error) {
      throw Exception(ApiErrorHelper.toUserMessage(error,
          fallback: 'Report gagal dibuat.'));
    }
  }

  Future<GeneratedReport> _download(
      String path, ExternalReportItem report) async {
    final response = await _api.get(
      path,
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
    final raw = response.data;
    final bytes = raw is Uint8List
        ? raw
        : raw is List<int>
            ? Uint8List.fromList(raw)
            : Uint8List(0);
    if (bytes.isEmpty) throw Exception('File report kosong.');
    final disposition = response.headers.value('content-disposition') ?? '';
    final match =
        RegExp(r'''filename\*?=(?:UTF-8''|\")?([^";]+)''', caseSensitive: false)
            .firstMatch(disposition);
    final filename = match?.group(1)?.trim() ??
        '${report.title.replaceAll(RegExp(r'[^a-zA-Z0-9_-]+'), '-')}.pdf';
    return GeneratedReport(bytes, Uri.decodeComponent(filename));
  }
}
