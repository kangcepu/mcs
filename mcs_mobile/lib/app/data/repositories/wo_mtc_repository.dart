import 'dart:convert';

import 'package:dio/dio.dart';
import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';
import '../models/wo_mtc_model.dart';
import '../models/executor_model.dart';
import '../models/labor_model.dart';
import '../models/material_mtc_model.dart';
import '../models/approval_model.dart';
import '../models/material_request_model.dart';
import '../models/create_wo_request.dart';
import '../models/update_wo_request.dart';
import '../models/material_request_payload.dart';
import '../models/work_order_model.dart'
    show PreventivePartExecution, PartExecutionMedia;

class WoMtcRepository {
  final ApiService _apiService = ApiService();

  Future<List<PreventivePartExecution>> getPartExecution(
      String woNumber) async {
    final response = await _apiService.get(
      ApiConstants.partExecutionWoMtc,
      queryParameters: {'wo_number': woNumber},
    );
    final payload =
        _decodeResponseMap(response.data) ?? const <String, dynamic>{};
    if (response.statusCode == 200 && payload['status'] == true) {
      return _asMapList(payload['data'])
          .map(PreventivePartExecution.fromJson)
          .toList();
    }
    throw Exception(
        payload['message'] ?? 'Failed to load preventive part execution');
  }

  Future<void> savePartExecution({
    required String woNumber,
    required List<PreventivePartExecution> rows,
  }) async {
    final response = await _apiService.post(
      ApiConstants.partExecutionWoMtc,
      data: {
        'wo_number': woNumber,
        'rows': rows.map((row) => row.toPayloadJson()).toList(),
      },
    );
    final payload =
        _decodeResponseMap(response.data) ?? const <String, dynamic>{};
    if (response.statusCode != 200 || payload['status'] != true) {
      throw Exception(
          payload['message'] ?? 'Failed to save preventive part execution');
    }
  }

  Future<PartExecutionMedia> uploadPartExecutionMedia({
    required String woNumber,
    required int customDetailId,
    required String partMesin,
    required String filePath,
  }) async {
    final response = await _apiService.post(
      ApiConstants.partExecutionMediaWoMtc,
      data: FormData.fromMap({
        'wo_number': woNumber,
        'custom_detail_id': customDetailId,
        'part_mesin': partMesin,
        'media': await MultipartFile.fromFile(filePath),
      }),
    );
    final payload =
        _decodeResponseMap(response.data) ?? const <String, dynamic>{};
    if (response.statusCode == 200 &&
        payload['status'] == true &&
        payload['data'] is Map) {
      return PartExecutionMedia.fromJson(
          Map<String, dynamic>.from(payload['data'] as Map));
    }
    throw Exception(
        payload['message'] ?? 'Failed to upload preventive part media');
  }

  Map<String, dynamic>? _decodeResponseMap(dynamic raw) {
    final source = _decodeMaybeJson(raw);
    if (source is Map) {
      return Map<String, dynamic>.from(source);
    }
    if (source is List && source.length == 1 && source.first is Map) {
      return Map<String, dynamic>.from(source.first as Map);
    }
    return null;
  }

  dynamic _decodeMaybeJson(dynamic raw) {
    if (raw is String) {
      try {
        return jsonDecode(raw);
      } catch (_) {
        return raw;
      }
    }
    return raw;
  }

  dynamic _unwrapData(dynamic raw) {
    final source = _decodeMaybeJson(raw);
    if (source is Map && source.containsKey('data')) {
      return _unwrapData(source['data']);
    }
    return source;
  }

  List<dynamic> _asList(dynamic raw) {
    final source = _unwrapData(raw);
    if (source is List) {
      return source;
    }
    if (source is Map) {
      if (source.values.length == 1 && source.values.first is List) {
        return List<dynamic>.from(source.values.first as List);
      }

      final values = source.values.toList();
      final hasNestedMapOrList =
          values.any((value) => value is Map || value is List);
      if (!hasNestedMapOrList) {
        return [source];
      }

      return values;
    }
    return const [];
  }

  Map<String, dynamic> _asMap(dynamic raw) {
    final source = _unwrapData(raw);
    if (source is Map) {
      return Map<String, dynamic>.from(source);
    }
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _asMapList(dynamic raw) {
    final list = _asList(raw);
    return list
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  List<String> _extractSuggestions(dynamic rawData) {
    final source = _decodeMaybeJson(rawData);
    final suggestions = <String>[];

    if (source is List) {
      for (final item in source) {
        if (item is String) {
          final value = item.trim();
          if (value.isNotEmpty) {
            suggestions.add(value);
          }
          continue;
        }

        if (item is Map) {
          final value = (item['value'] ??
                      item['label'] ??
                      item['part'] ??
                      item['material'])
                  ?.toString() ??
              '';
          if (value.trim().isNotEmpty) {
            suggestions.add(value.trim());
          }
        }
      }
    }
    return suggestions.toSet().toList();
  }

  String? _extractUom(dynamic rawData) {
    final source = _decodeMaybeJson(rawData);
    if (source is Map) {
      final uom = (source['uom'] ?? source['UOM'])?.toString();
      if (uom != null && uom.trim().isNotEmpty) {
        return uom.trim();
      }
    }
    return null;
  }

  List<String> _extractUserFullnames(dynamic rawData) {
    final source = _decodeMaybeJson(rawData);
    final names = <String>{};

    if (source is List) {
      for (final item in source) {
        if (item is! Map) {
          continue;
        }

        final activeRaw = item['active'];
        final isInactive = activeRaw != null &&
            activeRaw.toString().trim().isNotEmpty &&
            activeRaw.toString() != '1';
        if (isInactive) {
          continue;
        }

        final fullname =
            (item['fullname'] ?? item['name'] ?? '').toString().trim();
        if (fullname.isEmpty || fullname.toLowerCase() == 'superuser') {
          continue;
        }
        names.add(fullname);
      }
    }

    final sorted = names.toList();
    sorted.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return sorted;
  }

  Future<Map<String, dynamic>> getDashboardStats({
    String? company,
    String? startDate,
    String? endDate,
  }) async {
    try {
      final queryParams = {
        if (company != null && company.isNotEmpty) 'company': company,
        if (startDate != null && startDate.isNotEmpty) 'start_date': startDate,
        if (endDate != null && endDate.isNotEmpty) 'end_date': endDate,
      };

      final response = await _apiService.get(
        ApiConstants.dashboardWoMtc,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data == null) {
          throw Exception('Response data is null');
        }

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to load dashboard stats');
        }
      } else {
        throw Exception(
            'HTTP ${response.statusCode}: ${response.statusMessage}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
            'API Error ${e.response?.statusCode}: ${e.response?.data}');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get dashboard stats error: $e');
    }
  }

  Future<Map<String, dynamic>> getWoList({
    int limit = 50,
    int offset = 0,
    String? status,
    String? typeWo,
    String? dateFrom,
    String? dateTo,
  }) async {
    try {
      final queryParams = {
        'limit': limit,
        'offset': offset,
        if (status != null && status.isNotEmpty) 'status': status,
        if (typeWo != null && typeWo.isNotEmpty) 'type_wo': typeWo,
        if (dateFrom != null && dateFrom.isNotEmpty) 'date_from': dateFrom,
        if (dateTo != null && dateTo.isNotEmpty) 'date_to': dateTo,
      };

      final response = await _apiService.get(
        ApiConstants.listWoMtc,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data == null) {
          throw Exception('Response data is null');
        }

        if (data['status'] == true) {
          final resultData = data['data'];

          if (resultData == null) {
            throw Exception('Result data is null');
          }

          return {
            'total': int.tryParse(
                    resultData['pagination']['total']?.toString() ?? '0') ??
                0,
            'limit': resultData['pagination']['limit'] ?? limit,
            'offset': offset,
            'items': resultData['items'] ?? [],
          };
        } else {
          throw Exception(data['message'] ?? 'Failed to load WO list');
        }
      } else {
        throw Exception(
            'HTTP ${response.statusCode}: ${response.statusMessage}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
            'API Error ${e.response?.statusCode}: ${e.response?.data}');
      } else if (e.type == DioExceptionType.connectionTimeout) {
        throw Exception('Connection timeout - Pastikan server berjalan');
      } else if (e.type == DioExceptionType.receiveTimeout) {
        throw Exception('Receive timeout - Server terlalu lama merespons');
      } else if (e.type == DioExceptionType.connectionError) {
        throw Exception('Connection error - Tidak bisa connect ke server');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get WO list error: $e');
    }
  }

  Future<List<WorkOrderMtc>> getPendingWo() async {
    try {
      final response = await _apiService.get(ApiConstants.pendingWoMtc);

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => WorkOrderMtc.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load pending WO');
        }
      } else {
        throw Exception('Failed to load pending WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get pending WO error: $e');
    }
  }

  Future<List<WorkOrderMtc>> getApprovedWo() async {
    try {
      final response = await _apiService.get(ApiConstants.approvedWoMtc);

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => WorkOrderMtc.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load approved WO');
        }
      } else {
        throw Exception('Failed to load approved WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get approved WO error: $e');
    }
  }

  Future<List<WorkOrderMtc>> getRejectedWo() async {
    try {
      final response = await _apiService.get(ApiConstants.rejectedWoMtc);

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => WorkOrderMtc.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load rejected WO');
        }
      } else {
        throw Exception('Failed to load rejected WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get rejected WO error: $e');
    }
  }

  Future<Map<String, dynamic>> getWoDetailBundle(String woNumber) async {
    try {
      final encodedWoNumber = Uri.encodeComponent(woNumber);
      final response = await _apiService.get(
        '${ApiConstants.detailWoMtc}?wo_number=$encodedWoNumber',
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final payload = _asMap(data['data']);
          final header = (payload['wo_header'] is Map)
              ? Map<String, dynamic>.from(payload['wo_header'] as Map)
              : payload;

          final extras = <String, dynamic>{};
          if (data['extras'] is Map) {
            extras.addAll(Map<String, dynamic>.from(data['extras'] as Map));
          }
          if (payload['extras'] is Map) {
            extras.addAll(Map<String, dynamic>.from(payload['extras'] as Map));
          }

          // Backward compatibility:
          // beberapa server menaruh list detail langsung di data.
          const listKeys = [
            'executors',
            'labor',
            'material',
            'material_requests',
            'material_received',
            'material_purchase',
          ];
          for (final key in listKeys) {
            if (!extras.containsKey(key) && payload.containsKey(key)) {
              extras[key] = payload[key];
            }
            if (!extras.containsKey(key) && header.containsKey(key)) {
              extras[key] = header[key];
            }
          }

          return {
            'header': header,
            'extras': extras,
          };
        } else {
          throw Exception(data['message'] ?? 'Failed to load WO detail');
        }
      } else {
        throw Exception('Failed to load WO detail: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get WO detail error: $e');
    }
  }

  Future<WorkOrderMtc> getWoDetail(String woNumber) async {
    final bundle = await getWoDetailBundle(woNumber);
    final header = (bundle['header'] as Map<String, dynamic>? ?? {});
    return WorkOrderMtc.fromJson(header);
  }

  Future<String> generateWoNumber() async {
    try {
      final response = await _apiService.get(ApiConstants.generateNumberWoMtc);

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data['data']['wo_number'];
        } else {
          throw Exception(data['message'] ?? 'Failed to generate WO number');
        }
      } else {
        throw Exception('Failed to generate WO number: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Generate WO number error: $e');
    }
  }

  Future<Map<String, dynamic>> createWo(CreateWoRequest request) async {
    try {
      final response = await _apiService.post(
        ApiConstants.createWoMtc,
        data: request.toJson(),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to create WO');
        }
      } else {
        throw Exception('Failed to create WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Create WO error: $e');
    }
  }

  Future<Map<String, dynamic>> updateWo(
      String woNumber, UpdateWoRequest request) async {
    try {
      // wo_number dikirim di body — WO number mengandung slash yang memecah URL path
      final body = Map<String, dynamic>.from(request.toJson());
      body['wo_number'] = woNumber;

      final response = await _apiService.post(
        ApiConstants.updateWoMtc,
        data: body,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to update WO');
        }
      } else {
        throw Exception('Failed to update WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Update WO error: $e');
    }
  }

  Future<Map<String, dynamic>> deleteWo(String woNumber) async {
    try {
      final response = await _apiService.post(
        ApiConstants.deleteWoMtc,
        data: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to delete WO');
        }
      } else {
        throw Exception('Failed to delete WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Delete WO error: $e');
    }
  }

  Future<List<Executor>> getExecutorList(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.executorWoMtc,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => Executor.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load executor list');
        }
      } else {
        throw Exception('Failed to load executor list: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get executor list error: $e');
    }
  }

  Future<Executor> getExecutorDetail(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.executorDetailWoMtc,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return Executor.fromJson(data['data']);
        } else {
          throw Exception(data['message'] ?? 'Failed to load executor detail');
        }
      } else {
        throw Exception(
            'Failed to load executor detail: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get executor detail error: $e');
    }
  }

  Future<Map<String, dynamic>> addJobExplanation(
    String woNumber,
    String jobExplanation,
    String status, {
    int isExternal = 0,
    List<String> servicePhotoPaths = const [],
  }) async {
    try {
      // wo_number dikirim di body, BUKAN di URL path.
      // WO number format "WO-032026/VKD RU/0006" mengandung slash & spasi yang
      // menyebabkan CodeIgniter router memecahnya jadi beberapa segment → 404.
      final formData = FormData.fromMap({
        'wo_number': woNumber,
        'job_explanation': jobExplanation,
        'status': status,
        'is_external': isExternal,
      });

      for (final filePath in servicePhotoPaths) {
        final fileName = filePath.split('/').last;

        formData.files.add(
          MapEntry(
            'service_photos',
            await MultipartFile.fromFile(filePath, filename: fileName),
          ),
        );
      }

      final response = await _apiService.post(
        ApiConstants.jobExplanationWoMtc, // tanpa /$woNumber di URL
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to add job explanation');
        }
      } else {
        throw Exception(
            'Failed to add job explanation: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Add job explanation error: $e');
    }
  }

  Future<List<Labor>> getLaborList(String woNumber,
      {String? jobExecutor}) async {
    try {
      final queryParams = {
        'wo_number': woNumber,
        if (jobExecutor != null) 'job_executor': jobExecutor,
      };

      final response = await _apiService.get(
        ApiConstants.laborWoMtc,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => Labor.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load labor list');
        }
      } else {
        throw Exception('Failed to load labor list: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get labor list error: $e');
    }
  }

  Future<Map<String, dynamic>> addLabor(
    String woNumber,
    String trade,
    int men,
    double hours,
  ) async {
    return addLaborMany(woNumber, [trade], men, hours);
  }

  Future<Map<String, dynamic>> addLaborMany(
    String woNumber,
    List<String> trades,
    int men,
    double hours,
  ) async {
    try {
      final normalized = trades
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toSet()
          .toList();

      if (normalized.isEmpty) {
        throw Exception('PIC wajib dipilih');
      }
      if (normalized.length > 10) {
        throw Exception('Maksimal 10 PIC');
      }

      final response = await _apiService.post(
        ApiConstants.laborWoMtc,
        data: {
          'wo_number': woNumber,
          'trade': normalized.length == 1 ? normalized.first : normalized,
          'men': men,
          'hours': hours,
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to add labor');
        }
      } else {
        throw Exception('Failed to add labor: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Add labor error: $e');
    }
  }

  Future<Map<String, dynamic>> removeLabor(int id, String woNumber) async {
    try {
      final response = await _apiService.delete(
        ApiConstants.laborWoMtc,
        queryParameters: {
          'id': id,
          'wo_number': woNumber,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to remove labor');
        }
      } else {
        throw Exception('Failed to remove labor: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Remove labor error: $e');
    }
  }

  Future<List<MaterialMtc>> getMaterialList(String woNumber,
      {String? jobExecutor}) async {
    try {
      final queryParams = {
        'wo_number': woNumber,
        if (jobExecutor != null) 'job_executor': jobExecutor,
      };

      final response = await _apiService.get(
        ApiConstants.materialWoMtc,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => MaterialMtc.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load material list');
        }
      } else {
        throw Exception('Failed to load material list: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get material list error: $e');
    }
  }

  Future<Map<String, dynamic>> addMaterial(
    String woNumber,
    String material,
    double qty,
    String unit,
    String pr,
  ) async {
    try {
      final response = await _apiService.post(
        ApiConstants.materialWoMtc,
        data: {
          'wo_number': woNumber,
          'material': material,
          'qty': qty,
          'unit': unit,
          'pr': pr,
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final map = _decodeResponseMap(response.data);
        if (map != null && map.containsKey('status')) {
          if (map['status'] == true) {
            return map;
          }
          throw Exception(map['message'] ?? 'Failed to add material');
        }

        // Some servers may return a non-map JSON (list/string) even on success.
        // Treat any 2xx response as success and let UI refresh the latest data.
        return {
          'status': true,
          'message': 'Material added successfully',
          'data': response.data,
        };
      } else {
        throw Exception('Failed to add material: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Add material error: $e');
    }
  }

  Future<List<String>> searchMaterialSuggestions(String keyword) async {
    final query = keyword.trim();
    if (query.isEmpty) {
      return [];
    }

    final collected = <String>[];

    try {
      final response = await _apiService.get(
        ApiConstants.materialSuggestionWoOperational,
        queryParameters: {'term': query},
      );
      if (response.statusCode == 200) {
        collected.addAll(_extractSuggestions(response.data));
      }
    } catch (_) {}

    return collected.toSet().toList();
  }

  Future<String?> getMaterialUom(String partName) async {
    final part = partName.trim();
    if (part.isEmpty) {
      return null;
    }

    try {
      final response = await _apiService.post(
        ApiConstants.materialDetailWoOperational,
        data: {'part': part},
      );
      if (response.statusCode == 200) {
        final uom = _extractUom(response.data);
        if (uom != null && uom.isNotEmpty) {
          return uom;
        }
      }
    } catch (_) {}

    return null;
  }

  Future<List<String>> getLaborPicOptions() async {
    try {
      final response =
          await _apiService.get(ApiConstants.getListUserWoOperational);
      if (response.statusCode != 200) {
        throw Exception('Failed to load user PIC: ${response.statusCode}');
      }

      final data = response.data;
      if (data is Map && data['status'] == true) {
        return _extractUserFullnames(data['data']);
      }

      throw Exception(
          (data is Map ? data['message'] : null) ?? 'Failed to load user PIC');
    } catch (e) {
      throw Exception('Get labor PIC error: $e');
    }
  }

  Future<Map<String, dynamic>> removeMaterial(int id, String woNumber) async {
    try {
      final response = await _apiService.delete(
        ApiConstants.materialWoMtc,
        queryParameters: {
          'id': id,
          'wo_number': woNumber,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to remove material');
        }
      } else {
        throw Exception('Failed to remove material: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Remove material error: $e');
    }
  }

  Future<List<Approval>> getApprovalHistory(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.approvalWoMtc,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map((item) => Approval.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load approval history');
        }
      } else {
        throw Exception(
            'Failed to load approval history: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get approval history error: $e');
    }
  }

  Future<Map<String, dynamic>> requestMaterial(
      MaterialRequestPayload payload) async {
    try {
      final response = await _apiService.post(
        ApiConstants.materialRequestWoMtc,
        data: payload.toJson(),
      );

      if (response.statusCode == 200) {
        final map = _decodeResponseMap(response.data);
        if (map != null && map.containsKey('status')) {
          if (map['status'] == true) {
            return map;
          }
          throw Exception(map['message'] ?? 'Failed to request material');
        }

        return {
          'status': true,
          'message': 'Material request submitted successfully',
          'data': response.data,
        };
      } else {
        throw Exception('Failed to request material: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Request material error: $e');
    }
  }

  Future<List<MaterialRequest>> getMaterialReceived(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.materialReceivedWoMtc,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map(MaterialRequest.fromJson).toList();
        } else {
          throw Exception(
              data['message'] ?? 'Failed to load material received');
        }
      } else {
        throw Exception(
            'Failed to load material received: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get material received error: $e');
    }
  }

  Future<List<MaterialRequest>> getMaterialPurchase(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.materialPurchaseWoMtc,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final items = _asMapList(data['data']);
          return items.map(MaterialRequest.fromJson).toList();
        } else {
          throw Exception(
              data['message'] ?? 'Failed to load material purchase');
        }
      } else {
        throw Exception(
            'Failed to load material purchase: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get material purchase error: $e');
    }
  }

  Future<Map<String, dynamic>> createSubWo(
      String woNumber, String subTo) async {
    try {
      final response = await _apiService.post(
        ApiConstants.subWoMtc,
        data: {
          'wo_number': woNumber,
          'subto': subTo,
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to create sub WO');
        }
      } else {
        throw Exception('Failed to create sub WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Create sub WO error: $e');
    }
  }

  Future<Map<String, dynamic>> voidWo(String woNumber, String reason) async {
    try {
      final response = await _apiService.post(
        ApiConstants.voidWoMtc,
        data: {
          'wo_number': woNumber,
          'reason': reason,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to void WO');
        }
      } else {
        throw Exception('Failed to void WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Void WO error: $e');
    }
  }

  Future<List<WorkOrderMtc>> getAssetHistory(String idEquipment) async {
    try {
      final response = await _apiService.get(
        ApiConstants.assetHistoryWoMtc,
        queryParameters: {'id_equipment': idEquipment},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final List items = data['data'] ?? [];
          return items.map((item) => WorkOrderMtc.fromJson(item)).toList();
        } else {
          throw Exception(data['message'] ?? 'Failed to load asset history');
        }
      } else {
        throw Exception('Failed to load asset history: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get asset history error: $e');
    }
  }

  Future<Map<String, dynamic>> approveWo(
    String woNumber,
    String comment,
    String action,
  ) async {
    try {
      final response = await _apiService.post(
        ApiConstants.approveWoMtc,
        data: {
          'wo_number': woNumber,
          'comment': comment,
          'action': action,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to approve WO');
        }
      } else {
        throw Exception('Failed to approve WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Approve WO error: $e');
    }
  }

  Future<Map<String, dynamic>> completeWo(
      String woNumber, String comment) async {
    try {
      final response = await _apiService.post(
        ApiConstants.completeWoMtc,
        data: {
          'wo_number': woNumber,
          'comment': comment,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to complete WO');
        }
      } else {
        throw Exception('Failed to complete WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Complete WO error: $e');
    }
  }

  Future<Map<String, dynamic>> closeWo(String woNumber, String comment) async {
    try {
      final response = await _apiService.post(
        ApiConstants.approvalCloseWo,
        data: {
          'module': 'wo_mtc',
          'wo_number': woNumber,
          'comment': comment,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to close WO');
        }
      } else {
        throw Exception('Failed to close WO: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Close WO error: $e');
    }
  }

  Future<Map<String, dynamic>> uploadAttachment(
      String woNumber, String filePath) async {
    try {
      final fileName = filePath.split('/').last;

      final formData = FormData.fromMap({
        'wo_number': woNumber,
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      });

      final response = await _apiService.post(
        ApiConstants.uploadAttachmentWoMtc,
        data: formData,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to upload attachment');
        }
      } else {
        throw Exception('Failed to upload attachment: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Upload attachment error: $e');
    }
  }
}
