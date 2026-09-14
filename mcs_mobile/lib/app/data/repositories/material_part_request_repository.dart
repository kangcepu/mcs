import 'package:dio/dio.dart';
import '../../core/constants/api_constants.dart';
import '../providers/api_service.dart';

class MaterialPartRequestRepository {
  final ApiService _apiService = ApiService();

  Future<Map<String, dynamic>> requestPart({
    required String woNumber,
    String? jobExecutor,
    String? note,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.materialPartRequest,
        data: {
          'wo_number': woNumber,
          if (jobExecutor != null && jobExecutor.isNotEmpty)
            'job_executor': jobExecutor,
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception('Failed to request part: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final data = e.response!.data;
        final message = data is Map ? (data['message'] ?? 'Error') : 'Error';
        throw Exception(message);
      }
      throw Exception('Network error: ${e.message}');
    }
  }

  Future<Map<String, dynamic>> getRequestList({
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'limit': limit,
        'offset': offset,
      };
      if (status != null && status.isNotEmpty) {
        queryParams['status'] = status;
      }

      final response = await _apiService.get(
        ApiConstants.materialPartRequestList,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception('Failed to get request list: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final data = e.response!.data;
        final message = data is Map ? (data['message'] ?? 'Error') : 'Error';
        throw Exception(message);
      }
      throw Exception('Network error: ${e.message}');
    }
  }

  Future<Map<String, dynamic>> selectPart({
    required int id,
    required String partName,
    required double qty,
    String uom = 'PCS',
    String? prNumber,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.materialPartRequestSelect,
        data: {
          'id': id,
          'part_name': partName,
          'qty': qty,
          'uom': uom,
          if (prNumber != null && prNumber.isNotEmpty) 'pr_number': prNumber,
        },
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception('Failed to select part: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final data = e.response!.data;
        final message = data is Map ? (data['message'] ?? 'Error') : 'Error';
        throw Exception(message);
      }
      throw Exception('Network error: ${e.message}');
    }
  }

  Future<Map<String, dynamic>> cancelRequest(int id) async {
    try {
      final response = await _apiService.delete(
        '${ApiConstants.materialPartRequestCancel}?id=$id',
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception('Failed to cancel request: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final data = e.response!.data;
        final message = data is Map ? (data['message'] ?? 'Error') : 'Error';
        throw Exception(message);
      }
      throw Exception('Network error: ${e.message}');
    }
  }
}
