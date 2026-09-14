import 'package:dio/dio.dart';

import '../../core/constants/api_constants.dart';
import '../providers/api_service.dart';

class AssetMutationRepository {
  final ApiService _apiService = ApiService();

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) {
      return <Map<String, dynamic>>[];
    }
    return value
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
  }

  Future<Map<String, dynamic>> getMeta({
    String locationBefore = '',
    String companyBefore = '',
    String search = '',
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.assetMutationMeta,
        queryParameters: {
          if (locationBefore.trim().isNotEmpty)
            'location_before': locationBefore.trim(),
          if (companyBefore.trim().isNotEmpty)
            'company_before': companyBefore.trim(),
          if (search.trim().isNotEmpty) 'search': search.trim(),
        },
      );

      if (response.statusCode == 200) {
        final body = _asMap(response.data);
        if (body['status'] == true) {
          return _asMap(body['data']);
        }
      }
      return <String, dynamic>{};
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to load mutation meta');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Mutation meta error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getAssets({
    String locationBefore = '',
    String companyBefore = '',
    String search = '',
    int limit = 120,
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.assetMutationAssets,
        queryParameters: {
          if (locationBefore.trim().isNotEmpty)
            'location_before': locationBefore.trim(),
          if (companyBefore.trim().isNotEmpty)
            'company_before': companyBefore.trim(),
          if (search.trim().isNotEmpty) 'search': search.trim(),
          'limit': limit,
        },
      );

      if (response.statusCode == 200) {
        final body = _asMap(response.data);
        if (body['status'] == true) {
          final data = _asMap(body['data']);
          return _asMapList(data['items']);
        }
      }
      return <Map<String, dynamic>>[];
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to load assets');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Mutation assets error: $e');
    }
  }

  Future<Map<String, dynamic>> getRequests({
    String search = '',
    String status = '',
    int limit = 200,
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.assetMutationRequests,
        queryParameters: {
          if (search.trim().isNotEmpty) 'search': search.trim(),
          if (status.trim().isNotEmpty) 'status': status.trim(),
          'limit': limit,
        },
      );

      if (response.statusCode == 200) {
        final body = _asMap(response.data);
        if (body['status'] == true) {
          return _asMap(body['data']);
        }
      }
      return <String, dynamic>{};
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to load requests');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Mutation request list error: $e');
    }
  }

  Future<Map<String, dynamic>> getRequestDetail({
    required String docNo,
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.assetMutationRequestDetail,
        queryParameters: {'doc_no': docNo},
      );

      if (response.statusCode == 200) {
        final body = _asMap(response.data);
        if (body['status'] == true) {
          return _asMap(body['data']);
        }
      }
      return <String, dynamic>{};
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to load request detail');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Mutation request detail error: $e');
    }
  }

  Future<Map<String, dynamic>> addDetail({
    required String docNo,
    required String assetCode,
    required String assetName,
    required String companyAfter,
    required String locationAfter,
    required String mutationPurpose,
    int assetId = 0,
    String aliasName = '',
    String category = '',
    List<String> attachmentPaths = const [],
  }) async {
    try {
      final formData = FormData.fromMap({
        'doc_no': docNo.trim(),
        'asset_id': assetId > 0 ? assetId : '',
        'asset_code': assetCode.trim(),
        'asset_name': assetName.trim(),
        'alias_name': aliasName.trim(),
        'category': category.trim(),
        'company_after': companyAfter.trim(),
        'location_after': locationAfter.trim(),
        'mutation_purpose': mutationPurpose.trim(),
      });

      for (final path in attachmentPaths) {
        final filePath = path.trim();
        if (filePath.isEmpty) {
          continue;
        }
        final fileName = filePath.split(RegExp(r'[\\/]')).last;
        formData.files.add(
          MapEntry(
            'attachments[]',
            await MultipartFile.fromFile(filePath, filename: fileName),
          ),
        );
      }

      final response = await _apiService.post(
        ApiConstants.assetMutationAddDetail,
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final body = _asMap(response.data);
        if (body['status'] == true) {
          return _asMap(body['data']);
        }
      }
      return <String, dynamic>{};
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to add detail');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Add mutation detail error: $e');
    }
  }

  Future<bool> deleteDetail(int id) async {
    try {
      final response = await _apiService.post(
        ApiConstants.assetMutationDeleteDetail,
        data: {'id': id},
      );

      if (response.statusCode == 200) {
        final body = _asMap(response.data);
        return body['status'] == true;
      }
      return false;
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to delete detail');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Delete mutation detail error: $e');
    }
  }

  Future<bool> submitRequest({
    required String docNo,
    required String date,
    required String locationBefore,
    required String companyBefore,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.assetMutationSubmit,
        data: {
          'doc_no': docNo.trim(),
          'date': date.trim(),
          'location_before': locationBefore.trim(),
          'company_before': companyBefore.trim(),
        },
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final body = _asMap(response.data);
        return body['status'] == true;
      }
      return false;
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to submit request');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Submit mutation request error: $e');
    }
  }

  Future<bool> approveRequest(String docNo) async {
    try {
      final response = await _apiService.post(
        ApiConstants.assetMutationApprove,
        data: {'doc_no': docNo.trim()},
      );

      if (response.statusCode == 200) {
        final body = _asMap(response.data);
        return body['status'] == true;
      }
      return false;
    } on DioException catch (e) {
      if (e.response != null) {
        final body = _asMap(e.response!.data);
        throw Exception(body['message'] ?? 'Failed to approve request');
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Approve mutation request error: $e');
    }
  }
}

