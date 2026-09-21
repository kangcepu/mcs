import 'dart:convert';

import 'package:dio/dio.dart';
import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';
import '../models/wo_model.dart';

class WoRepository {
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

      print('🔍 Query params: $queryParams');

      final response = await _apiService.get(
        ApiConstants.listWo,
        queryParameters: queryParams,
      );

      print('📦 Response status: ${response.statusCode}');
      print('📦 Response data: ${response.data}');

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
            'total': int.tryParse(resultData['total']?.toString() ?? '0') ?? 0,
            'limit': resultData['limit'] ?? limit,
            'offset': resultData['offset'] ?? offset,
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
      print('❌ DioException type: ${e.type}');
      print('❌ DioException message: ${e.message}');
      print('❌ DioException response: ${e.response?.data}');

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
      print('❌ General error: $e');
      throw Exception('Get WO list error: $e');
    }
  }

  Future<Map<String, dynamic>> getWoDetail(String woNumber) async {
    try {
      final response = await _apiService.get(
        ApiConstants.detailWo,
        queryParameters: {'wo_number': woNumber},
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          return data['data'];
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

  Future<String> generateWoNumber() async {
    try {
      final response = await _apiService.get(ApiConstants.getNewWo);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data is Map && data['status'] == true) {
          final woNumber = (data['data']?['wo_number'] ?? '').toString().trim();
          if (woNumber.isNotEmpty) {
            return woNumber;
          }
        }
        throw Exception(data['message'] ?? 'Failed to generate WO number');
      }
      throw Exception('Failed to generate WO number: ${response.statusCode}');
    } catch (e) {
      throw Exception('Generate WO number error: $e');
    }
  }

  Future<Map<String, dynamic>> createWo(FormData formData) async {
    try {
      final response = await _apiService.post(
        ApiConstants.createWo,
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
        ),
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
    String woNumber,
    Map<String, dynamic> updateData, {
    String? attachmentPath,
  }) async {
    try {
      // Gunakan POST + FormData agar bisa membawa file attachment
      final formFields = <String, dynamic>{
        'wo_number': woNumber,
        ...updateData,
      };

      final formData = FormData.fromMap(formFields);

      if (attachmentPath != null && attachmentPath.isNotEmpty) {
        formData.files.add(MapEntry(
          'attachment',
          await MultipartFile.fromFile(attachmentPath),
        ));
      }

      final response = await _apiService.post(
        ApiConstants.updateWo,
        data: formData,
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
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(errorData['message'] ?? 'Failed to update WO');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Update WO error: $e');
    }
  }

  Future<Map<String, dynamic>> approveWo(
      String woNumber, String comment, String action) async {
    try {
      final response = await _apiService.post(ApiConstants.approveWo,
          data: {'wo_number': woNumber, 'comment': comment, 'action': action});
      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to approve WO');
      }
      throw Exception('Failed to approve WO: ${response.statusCode}');
    } catch (e) {
      throw Exception('Approve WO error: $e');
    }
  }

  Future<Map<String, dynamic>> addJobExplanation(
      int executorId, String jobExplanation, String status,
      {List<String> servicePhotoPaths = const []}) async {
    try {
      final formData = FormData.fromMap({
        'id': executorId,
        'job_explanation': jobExplanation,
        'status': status,
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

      final response = await _apiService.post(ApiConstants.addJobExplanationWo,
          data: formData, options: Options(contentType: 'multipart/form-data'));
      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to add job explanation');
      }
      throw Exception('Failed to add job explanation: ${response.statusCode}');
    } catch (e) {
      throw Exception('Add job explanation error: $e');
    }
  }

  Future<Map<String, dynamic>> addLabor(
    String woNumber,
    String jobExecutor,
    String trade,
    int men,
    double hours,
  ) async {
    try {
      final response = await _apiService.post(
        ApiConstants.addLaborWo,
        data: {
          'wo_number': woNumber,
          'job_executor': jobExecutor,
          'trade': trade,
          'men': men,
          'hours': hours,
        },
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to add labor');
      }
      throw Exception('Failed to add labor: ${response.statusCode}');
    } catch (e) {
      throw Exception('Add labor error: $e');
    }
  }

  Future<Map<String, dynamic>> addMaterial(
    String woNumber,
    String jobExecutor,
    String material,
    double qty,
    String unit,
    String pr,
  ) async {
    try {
      final response = await _apiService.post(
        ApiConstants.addMaterialWo,
        data: {
          'wo_number': woNumber,
          'job_executor': jobExecutor,
          'material': material,
          'qty': qty,
          'material_name': material,
          'quantity': qty,
          'unit': unit,
          'pr': pr,
        },
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to add material');
      }
      throw Exception('Failed to add material: ${response.statusCode}');
    } catch (e) {
      throw Exception('Add material error: $e');
    }
  }

  Future<Map<String, dynamic>> completeWo(
      String woNumber, String comment) async {
    try {
      final response = await _apiService.post(ApiConstants.completeWo,
          data: {'wo_number': woNumber, 'comment': comment});
      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to complete WO');
      }
      throw Exception('Failed to complete WO: ${response.statusCode}');
    } catch (e) {
      throw Exception('Complete WO error: $e');
    }
  }

  Future<Map<String, dynamic>> closeWo(String woNumber, String comment) async {
    try {
      final response = await _apiService.post(ApiConstants.closeWo,
          data: {'wo_number': woNumber, 'comment': comment});
      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to close WO');
      }
      throw Exception('Failed to close WO: ${response.statusCode}');
    } catch (e) {
      throw Exception('Close WO error: $e');
    }
  }

  Future<Map<String, dynamic>> voidWo(String woNumber, String reason) async {
    try {
      final response = await _apiService.post(ApiConstants.voidWo,
          data: {'wo_number': woNumber, 'reason': reason});
      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) return data;
        throw Exception(data['message'] ?? 'Failed to void WO');
      }
      throw Exception('Failed to void WO: ${response.statusCode}');
    } catch (e) {
      throw Exception('Void WO error: $e');
    }
  }

  Future<Map<String, dynamic>> getDashboardStats({
    String? dateFrom,
    String? dateTo,
    String? company,
  }) async {
    try {
      final queryParams = {
        if (dateFrom != null && dateFrom.isNotEmpty) 'start_date': dateFrom,
        if (dateTo != null && dateTo.isNotEmpty) 'end_date': dateTo,
        if (company != null && company.isNotEmpty) 'company': company,
      };

      final response = await _apiService.get(
        ApiConstants.dashboardWo,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data == null) throw Exception('Response data is null');
        if (data['status'] == true) {
          return data['data'] ?? {};
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
      } else if (e.type == DioExceptionType.connectionTimeout) {
        throw Exception('Connection timeout');
      } else if (e.type == DioExceptionType.connectionError) {
        throw Exception('Connection error - Tidak bisa connect ke server');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Get dashboard stats error: $e');
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
}
