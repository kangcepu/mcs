import 'package:dio/dio.dart';

import '../../core/constants/api_constants.dart';
import '../../core/utils/api_error_helper.dart';
import '../models/approval_center_model.dart';
import '../providers/api_service.dart';

class ApprovalRepository {
  final ApiService _apiService = ApiService();

  Future<ApprovalSummary> getSummary() async {
    try {
      final response = await _apiService.get(ApiConstants.approvalSummary);
      final data = _extractData(response);
      return ApprovalSummary.fromJson(data);
    } on DioException catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal memuat ringkasan approval.',
        ),
      );
    } catch (e) {
      throw Exception('Gagal memuat ringkasan approval: $e');
    }
  }

  Future<List<ApprovalItem>> getWoApprovals() async {
    return _getApprovalList(ApiConstants.approvalWoApprovals);
  }

  Future<List<ApprovalItem>> getWoClosings() async {
    return _getApprovalList(ApiConstants.approvalWoClosings);
  }

  Future<List<ApprovalItem>> getMutations() async {
    return _getApprovalList(ApiConstants.approvalMutations);
  }

  Future<List<ApprovalItem>> getMaterials() async {
    return _getApprovalList(ApiConstants.approvalMaterials);
  }

  Future<Map<String, dynamic>> approveWo({
    required String module,
    required String woNumber,
  }) async {
    return _postAction(
      ApiConstants.approvalApproveWo,
      data: {
        'module': module,
        'wo_number': woNumber,
      },
    );
  }

  Future<Map<String, dynamic>> closeWo({
    required String module,
    required String woNumber,
  }) async {
    return _postAction(
      ApiConstants.approvalCloseWo,
      data: {
        'module': module,
        'wo_number': woNumber,
      },
    );
  }

  Future<Map<String, dynamic>> approveMutation({
    required String docNo,
  }) async {
    return _postAction(
      ApiConstants.approvalApproveMutation,
      data: {
        'doc_no': docNo,
      },
    );
  }

  Future<List<ApprovalItem>> _getApprovalList(String path) async {
    try {
      const perPage = 200;
      final items = <ApprovalItem>[];
      var page = 1;
      var totalPages = 1;

      do {
        final response = await _apiService.get(
          path,
          queryParameters: {
            'page': page,
            'per_page': perPage,
          },
        );
        final data = _extractData(response);
        final rows = (data['items'] as List?) ?? const [];
        items.addAll(
          rows.whereType<Map>().map(
                (item) => ApprovalItem.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              ),
        );

        final body = response.data as Map<String, dynamic>;
        final meta = body['meta'];
        totalPages =
            meta is Map ? _asPositiveInt(meta['total_pages'], fallback: 1) : 1;
        page++;
      } while (page <= totalPages);

      return items;
    } on DioException catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal memuat data approval.',
        ),
      );
    } catch (e) {
      throw Exception('Gagal memuat data approval: $e');
    }
  }

  Future<Map<String, dynamic>> _postAction(
    String path, {
    required Map<String, dynamic> data,
  }) async {
    try {
      final response = await _apiService.post(path, data: data);
      return _extractData(response);
    } on DioException catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Aksi approval gagal diproses.',
        ),
      );
    } catch (e) {
      throw Exception('Aksi approval gagal diproses: $e');
    }
  }

  Map<String, dynamic> _extractData(Response response) {
    if (response.statusCode != 200 || response.data is! Map<String, dynamic>) {
      throw Exception('Response API tidak valid.');
    }

    final body = response.data as Map<String, dynamic>;
    final succeeded = body['success'] == true || body['status'] == true;
    if (!succeeded) {
      throw Exception(body['message']?.toString() ?? 'Request gagal diproses.');
    }

    final payload = body['data'];
    if (payload is Map<String, dynamic>) {
      return payload;
    }

    if (payload is List) {
      return {'items': payload};
    }

    return <String, dynamic>{};
  }

  int _asPositiveInt(dynamic value, {required int fallback}) {
    final parsed = value is int ? value : int.tryParse(value?.toString() ?? '');
    return parsed != null && parsed > 0 ? parsed : fallback;
  }
}
