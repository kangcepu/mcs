import 'dart:convert';

import 'package:dio/dio.dart';
import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';
import '../models/work_order_model.dart';

class WoOperationalRepository {
  final ApiService _apiService = ApiService();

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

  bool _looksLikeHtml(String value) {
    final lower = value.toLowerCase();
    return lower.contains('<!doctype') || lower.contains('<html');
  }

  String _extractErrorMessage(
    dynamic rawData, {
    required String fallback,
  }) {
    final source = _decodeMaybeJson(rawData);

    if (source is Map) {
      final message = source['message']?.toString().trim();
      if (message != null && message.isNotEmpty) {
        return message;
      }

      final error = source['error']?.toString().trim();
      if (error != null && error.isNotEmpty) {
        return error;
      }
    }

    if (source is List && source.isNotEmpty) {
      final first = source.first;
      if (first is Map) {
        final message = first['message']?.toString().trim();
        if (message != null && message.isNotEmpty) {
          return message;
        }
      }
    }

    if (source is String) {
      final text = source.trim();
      if (text.isNotEmpty) {
        if (_looksLikeHtml(text)) {
          return 'Server error (HTML). Kemungkinan Database Error di backend.';
        }
        return text.length > 500 ? '${text.substring(0, 500)}...' : text;
      }
    }

    return fallback;
  }

  Map<String, dynamic> _ensureSuccessPayload(
    dynamic rawData, {
    required String fallback,
  }) {
    final source = _decodeMaybeJson(rawData);
    if (source is String) {
      final text = source.trim();
      if (text.isNotEmpty && _looksLikeHtml(text)) {
        throw Exception(
            'Server error (HTML). Kemungkinan Database Error di backend.');
      }
    }

    if (source is Map<String, dynamic>) {
      final status = source['status'];
      if (status == true) {
        return source;
      }
      final message = source['message']?.toString().trim();
      if (message != null && message.isNotEmpty) {
        throw Exception(message);
      }
      throw Exception(fallback);
    }

    if (source is Map) {
      final status = source['status'];
      if (status == true) {
        return Map<String, dynamic>.from(source);
      }
      final message = source['message']?.toString().trim();
      if (message != null && message.isNotEmpty) {
        throw Exception(message);
      }
      throw Exception(fallback);
    }

    throw Exception(fallback);
  }

  List<String> _extractSuggestions(dynamic rawData) {
    dynamic source = _decodeMaybeJson(rawData);
    if (source is Map && source['data'] != null) {
      source = source['data'];
    }

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
    dynamic source = _decodeMaybeJson(rawData);
    if (source is Map && source['data'] != null) {
      source = source['data'];
    }
    if (source is Map) {
      final uom = (source['uom'] ?? source['UOM'])?.toString();
      if (uom != null && uom.trim().isNotEmpty) {
        return uom.trim();
      }
    }
    return null;
  }

  List<String> _extractUserFullnames(dynamic rawData) {
    dynamic source = _decodeMaybeJson(rawData);
    if (source is Map && source['data'] != null) {
      source = source['data'];
    }

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

  Future<WorkOrderListResponse> getWoList({
    int page = 1,
    int limit = 10,
    String? status,
    String? search,
    String? dateFrom,
    String? dateTo,
    String? company,
    String? typeWo,
    String? sortOrder,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'page': page,
        'limit': limit,
      };

      if (status != null && status.isNotEmpty) queryParams['status'] = status;
      if (search != null && search.isNotEmpty) queryParams['search'] = search;
      if (dateFrom != null && dateFrom.isNotEmpty) {
        queryParams['date_from'] = dateFrom;
      }
      if (dateTo != null && dateTo.isNotEmpty) queryParams['date_to'] = dateTo;
      if (company != null && company.isNotEmpty) {
        queryParams['company'] = company;
      }
      if (typeWo != null && typeWo.isNotEmpty) queryParams['type_wo'] = typeWo;
      if (sortOrder != null && sortOrder.isNotEmpty) {
        queryParams['sort_order'] = sortOrder;
      }

      final response = await _apiService.get(
        ApiConstants.listWoOperational,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        return WorkOrderListResponse.fromJson(response.data);
      } else {
        throw Exception(
            'Failed to get WO Operational list: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get WO Operational list',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('WO Operational list error: $e');
    }
  }

  Future<Map<String, dynamic>> getWoDetail(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.detailWoOperational,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        if (ApiConstants.enableHttpLog) {
          final decoded = _decodeMaybeJson(response.data);
          if (decoded is Map && decoded['data'] is Map) {
            final data = decoded['data'] as Map;
            final laborLen =
                (data['labor'] is List) ? (data['labor'] as List).length : null;
            final materialLen = (data['material'] is List)
                ? (data['material'] as List).length
                : null;
            // ignore: avoid_print
            print(
              'WO_DETAIL wo_number=$woNumber labor=$laborLen material=$materialLen',
            );
          }
        }
        return response.data;
      } else {
        throw Exception(
            'Failed to get WO Operational detail: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get WO Operational detail',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('WO Operational detail error: $e');
    }
  }

  Future<List<PreventivePartExecution>> getPartExecution(
      String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.partExecutionWoOperational,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return (data['data'] as List?)
                  ?.map((item) => PreventivePartExecution.fromJson(item))
                  .toList() ??
              [];
        }
        throw Exception(data['message'] ?? 'Failed to get part execution');
      } else {
        throw Exception(
          'Failed to get part execution: ${response.statusCode}',
        );
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get part execution',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get part execution error: $e');
    }
  }

  Future<Map<String, dynamic>> savePartExecution({
    required String woNumber,
    required List<PreventivePartExecution> rows,
  }) async {
    try {
      final payload = {
        'wo_number': woNumber,
        'rows': rows.map((item) => item.toPayloadJson()).toList(),
      };

      final response = await _apiService.post(
        ApiConstants.partExecutionWoOperational,
        data: payload,
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return data as Map<String, dynamic>;
        }
        throw Exception(data['message'] ?? 'Failed to save part execution');
      } else {
        throw Exception(
          'Failed to save part execution: ${response.statusCode}',
        );
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to save part execution',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Save part execution error: $e');
    }
  }

  Future<PartExecutionMedia> uploadPartExecutionMedia({
    required String woNumber,
    required int customDetailId,
    required String partMesin,
    required String filePath,
  }) async {
    try {
      final formData = FormData.fromMap({
        'wo_number': woNumber,
        'custom_detail_id': customDetailId,
        'part_mesin': partMesin,
        'media': await MultipartFile.fromFile(filePath),
      });

      final response = await _apiService.post(
        ApiConstants.partExecutionMediaWoOperational,
        data: formData,
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true && data['data'] != null) {
          return PartExecutionMedia.fromJson(
            data['data'] as Map<String, dynamic>,
          );
        }
        throw Exception(data['message'] ?? 'Failed to upload media');
      } else {
        throw Exception(
          'Failed to upload media: ${response.statusCode}',
        );
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to upload media',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Upload part execution media error: $e');
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

  Future<Map<String, dynamic>> getDashboardStats({
    String? startDate,
    String? endDate,
    String? company,
  }) async {
    try {
      final queryParams = <String, dynamic>{};

      if (startDate != null) queryParams['start_date'] = startDate;
      if (endDate != null) queryParams['end_date'] = endDate;
      if (company != null) queryParams['company'] = company;

      final response = await _apiService.get(
        ApiConstants.dashboardWoOperational,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data;
        } else {
          throw Exception(data['message'] ?? 'Failed to get dashboard stats');
        }
      } else {
        throw Exception(
            'Failed to get dashboard stats: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get dashboard stats',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Dashboard stats error: $e');
    }
  }

  Future<WorkOrderListResponse> getMyWoList({
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'page': page,
        'limit': limit,
      };

      final response = await _apiService.get(
        ApiConstants.myWoOperational,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        return WorkOrderListResponse.fromJson(response.data);
      } else {
        throw Exception('Failed to get My WO list: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get My WO list',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('My WO list error: $e');
    }
  }

  Future<Map<String, dynamic>> createWo({
    String? woNumber,
    required String date,
    required String company,
    required String shift,
    required String typeWo,
    required String priority,
    required String idDivision,
    required String idEquipment,
    required String jobTitle,
    String? runningHours,
    required String jobRequirement,
    String? categoryMaintenance,
    String? attachmentPath,
    List<String>? attachmentPaths,
  }) async {
    try {
      final payload = <String, dynamic>{
        'date': date,
        'company': company,
        'shift': shift,
        'type_wo': typeWo,
        'priority': priority,
        'id_division': idDivision,
        'id_equipment': idEquipment,
        'job_title': jobTitle,
        'running_hours': runningHours ?? '',
        'job_requirement': jobRequirement,
        if (categoryMaintenance != null)
          'category_maintenance': categoryMaintenance,
      };

      if (woNumber != null && woNumber.trim().isNotEmpty) {
        payload['wo_number'] = woNumber.trim();
      }

      FormData formData = FormData.fromMap(payload);

      final normalizedPaths = (attachmentPaths ?? <String>[])
          .map((path) => path.trim())
          .where((path) => path.isNotEmpty)
          .toList();

      if (normalizedPaths.isNotEmpty) {
        for (final path in normalizedPaths) {
          formData.files.add(
            MapEntry(
              'attachment[]',
              await MultipartFile.fromFile(path),
            ),
          );
        }
      } else if (attachmentPath != null && attachmentPath.trim().isNotEmpty) {
        formData.files.add(
          MapEntry(
            'attachment',
            await MultipartFile.fromFile(attachmentPath.trim()),
          ),
        );
      }

      final response = await _apiService.post(
        ApiConstants.createWoOperational,
        data: formData,
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to create WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to create WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Create WO error: $e');
    }
  }

  Future<Map<String, dynamic>> updateWo({
    required String woNumber,
    String? date,
    String? company,
    String? shift,
    String? typeWo,
    String? priority,
    String? idDivision,
    String? idEquipment,
    String? jobTitle,
    String? runningHours,
    String? jobRequirement,
    String? categoryMaintenance,
    String? attachmentPath,
  }) async {
    try {
      FormData formData = FormData.fromMap({
        'wo_number': woNumber,
        if (date != null) 'date': date,
        if (company != null) 'company': company,
        if (shift != null) 'shift': shift,
        if (typeWo != null) 'type_wo': typeWo,
        if (priority != null) 'priority': priority,
        if (idDivision != null) 'id_division': idDivision,
        if (idEquipment != null) 'id_equipment': idEquipment,
        if (jobTitle != null) 'job_title': jobTitle,
        if (runningHours != null) 'running_hours': runningHours,
        if (jobRequirement != null) 'job_requirement': jobRequirement,
        if (categoryMaintenance != null)
          'category_maintenance': categoryMaintenance,
      });

      if (attachmentPath != null && attachmentPath.isNotEmpty) {
        formData.files.add(MapEntry(
          'attachment',
          await MultipartFile.fromFile(attachmentPath),
        ));
      }

      final response = await _apiService.post(
        ApiConstants.updateWoOperational,
        data: formData,
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to update WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to update WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Update WO error: $e');
    }
  }

  Future<Map<String, dynamic>> updateAsset({
    required String woNumber,
    required String idEquipment,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.updateAssetWoOperational,
        data: {
          'wo_number': woNumber,
          'id_equipment': idEquipment,
        },
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to update asset: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to update asset',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Update asset error: $e');
    }
  }

  Future<Map<String, dynamic>> deleteWo(String woNumber) async {
    try {
      final response = await _apiService.delete(
        ApiConstants.deleteWoOperational,
        data: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to delete WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to delete WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Delete WO error: $e');
    }
  }

  Future<Map<String, dynamic>> approveWo({
    required String woNumber,
    String? comment,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.approveWoOperational,
        data: {
          'wo_number': woNumber,
          'comment': comment ?? '',
        },
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to approve WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to approve WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Approve WO error: $e');
    }
  }

  Future<Map<String, dynamic>> declineWo({
    required String woNumber,
    required String comment,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.declineWoOperational,
        data: {
          'wo_number': woNumber,
          'comment': comment,
        },
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to decline WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to decline WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Decline WO error: $e');
    }
  }

  Future<Map<String, dynamic>> forwardWo({
    required String woNumber,
    required String toDivision,
    String? comment,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.forwardWoOperational,
        data: {
          'wo_number': woNumber,
          'to_division': toDivision,
          'comment': comment ?? '',
        },
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to forward WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to forward WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Forward WO error: $e');
    }
  }

  Future<Map<String, dynamic>> addJobExplanation({
    required String woNumber,
    required String jobExplanation,
    required String status,
    required String startedPlanner,
    required String startedActualTime,
    required String finishedPlanner,
    required String finishedActualTime,
    required String estimatePlanner,
    List<String> servicePhotoPaths = const [],
  }) async {
    try {
      final formData = FormData.fromMap({
        'wo_number': woNumber,
        'job_explanation': jobExplanation,
        'status': status,
        'started_planner': startedPlanner,
        'started_actual_time': startedActualTime,
        'finished_planner': finishedPlanner,
        'finished_actual_time': finishedActualTime,
        'estimate_planner': estimatePlanner,
      });
      for (final filePath in servicePhotoPaths) {
        final normalized = filePath.trim();
        if (normalized.isEmpty) {
          continue;
        }
        final filename = normalized.split(RegExp(r'[\\/]')).last;
        formData.files.add(
          MapEntry(
            'service_photos',
            await MultipartFile.fromFile(normalized, filename: filename),
          ),
        );
      }

      final response = await _apiService.post(
        ApiConstants.addJobExplanationWoOperational,
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: const Duration(seconds: 120),
          receiveTimeout: const Duration(seconds: 120),
        ),
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception(
            'Failed to add job explanation: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to add job explanation',
          ),
        );
      } else {
        final message = (e.message == null || e.message!.trim().isEmpty)
            ? e.type.name
            : e.message!;
        throw Exception('Network error: $message');
      }
    } catch (e) {
      throw Exception('Add job explanation error: $e');
    }
  }

  Future<Map<String, dynamic>> updateExecutor({
    required String id,
    required String woNumber,
    required String jobExecutor,
    required String status,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.updateExecutorWoOperational,
        data: {
          'id': id,
          'wo_number': woNumber,
          'job_executor': jobExecutor,
          'status': status,
        },
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to update executor: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to update executor',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Update executor error: $e');
    }
  }

  Future<Map<String, dynamic>> deleteExecutor(String id) async {
    try {
      final response = await _apiService.delete(
        ApiConstants.deleteExecutorWoOperational,
        data: {'id': id},
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to delete executor: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to delete executor',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Delete executor error: $e');
    }
  }

  Future<Map<String, dynamic>> addLabor({
    required String woNumber,
    required String jobExecutor,
    required String trade,
    required int men,
    required double hours,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.addLaborWoOperational,
        data: {
          'wo_number': woNumber,
          'job_executor': jobExecutor,
          'trade': trade,
          'men': men,
          'hours': hours,
        },
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final payload = _ensureSuccessPayload(
          response.data,
          fallback: 'Failed to add labor',
        );
        if (ApiConstants.enableHttpLog) {
          // ignore: avoid_print
          print('ADD_LABOR wo_number=$woNumber response=$payload');
        }
        return payload;
      } else {
        throw Exception('Failed to add labor: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to add labor',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Add labor error: $e');
    }
  }

  Future<Map<String, dynamic>> removeLabor(String id) async {
    try {
      final response = await _apiService.delete(
        ApiConstants.removeLaborWoOperational,
        data: {'id': id},
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to remove labor: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to remove labor',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Remove labor error: $e');
    }
  }

  Future<Map<String, dynamic>> addMaterial({
    required String woNumber,
    required String jobExecutor,
    required String material,
    required String unit,
    required double qty,
    String? pr,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.addMaterialWoOperational,
        data: {
          'wo_number': woNumber,
          'job_executor': jobExecutor,
          'material': material,
          'unit': unit,
          'qty': qty,
          if (pr != null) 'pr': pr,
        },
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final payload = _ensureSuccessPayload(
          response.data,
          fallback: 'Failed to add material',
        );
        if (ApiConstants.enableHttpLog) {
          // ignore: avoid_print
          print('ADD_MATERIAL wo_number=$woNumber response=$payload');
        }
        return payload;
      } else {
        throw Exception('Failed to add material: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to add material',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Add material error: $e');
    }
  }

  Future<Map<String, dynamic>> removeMaterial(String id) async {
    try {
      final response = await _apiService.delete(
        ApiConstants.removeMaterialWoOperational,
        data: {'id': id},
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to remove material: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to remove material',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Remove material error: $e');
    }
  }

  Future<List<dynamic>> getMaterialReceived(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.getMaterialReceivedWoOperational,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return data['data'] as List<dynamic>;
        } else {
          throw Exception(data['message'] ?? 'Failed to get material received');
        }
      } else {
        throw Exception(
            'Failed to get material received: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get material received',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get material received error: $e');
    }
  }

  Future<Map<String, dynamic>> addSubWo({
    required String woNumber,
    required String subto,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.addSubWoOperational,
        data: {
          'wo_number': woNumber,
          'subto': subto,
        },
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to add sub WO: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to add sub WO',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Add sub WO error: $e');
    }
  }

  Future<Map<String, dynamic>> voidDocument({
    required String woNumber,
    required String reason,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.voidDocumentWoOperational,
        data: {
          'wo_number': woNumber,
          'reason': reason,
        },
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('Failed to void document: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to void document',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Void document error: $e');
    }
  }

  Future<String> getNewWoNumber() async {
    try {
      final response = await _apiService.get(ApiConstants.getNewWoOperational);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return data['data']['wo_number'] as String;
        } else {
          throw Exception(data['message'] ?? 'Failed to get new WO number');
        }
      } else {
        throw Exception('Failed to get new WO number: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get new WO number',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get new WO number error: $e');
    }
  }

  Future<List<dynamic>> getListUser() async {
    try {
      final response =
          await _apiService.get(ApiConstants.getListUserWoOperational);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return data['data'] as List<dynamic>;
        } else {
          throw Exception(data['message'] ?? 'Failed to get user list');
        }
      } else {
        throw Exception('Failed to get user list: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          _extractErrorMessage(
            e.response!.data,
            fallback: 'Failed to get user list',
          ),
        );
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get user list error: $e');
    }
  }

  Future<List<String>> getLaborPicOptions() async {
    try {
      final users = await getListUser();
      return _extractUserFullnames(users);
    } catch (e) {
      throw Exception('Get labor PIC error: $e');
    }
  }

  Future<List<WorkOrder>> getVoidPreventiveCandidates() async {
    try {
      final response =
          await _apiService.get(ApiConstants.voidCandidatesWoOperational);
      final payload = _ensureSuccessPayload(
        response.data,
        fallback: 'Gagal memuat WO preventive untuk void',
      );
      final data = payload['data'];
      if (data is! List) return [];
      return data
          .whereType<Map>()
          .map((item) => WorkOrder.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } on DioException catch (e) {
      throw Exception(_extractErrorMessage(
        e.response?.data,
        fallback: 'Gagal memuat WO preventive untuk void',
      ));
    }
  }

  Future<void> voidPreventiveWo({
    required String woNumber,
    required String reason,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.voidPreventiveWoOperational,
        data: {'wo_number': woNumber, 'reason': reason},
      );
      _ensureSuccessPayload(
        response.data,
        fallback: 'Gagal melakukan void WO preventive',
      );
    } on DioException catch (e) {
      throw Exception(_extractErrorMessage(
        e.response?.data,
        fallback: 'Gagal melakukan void WO preventive',
      ));
    }
  }

  Future<Map<String, int>> getVoidHistory() async {
    try {
      final response =
          await _apiService.get(ApiConstants.voidHistoryWoOperational);
      final payload = _ensureSuccessPayload(
        response.data,
        fallback: 'Gagal memuat riwayat void',
      );
      final data = payload['data'];
      if (data is! Map) return {};

      final byDate = <String, int>{};
      data.forEach((key, value) {
        byDate[key.toString()] = int.tryParse(value.toString()) ?? 0;
      });
      return byDate;
    } on DioException catch (e) {
      throw Exception(_extractErrorMessage(
        e.response?.data,
        fallback: 'Gagal memuat riwayat void',
      ));
    }
  }
}
