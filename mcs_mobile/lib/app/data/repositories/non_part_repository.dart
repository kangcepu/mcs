import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/non_part_model.dart';
import '../../core/constants/api_constants.dart';

class NonPartRepository {
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<Map<String, String>> _getHeaders() async {
    final token = await _getToken();
    return {
      'Authorization': 'Bearer ${token ?? ''}',
      'Content-Type': 'application/json',
    };
  }

  Map<String, dynamic> _tryDecodeMap(String body) {
    try {
      final decoded = json.decode(body);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {}
    return <String, dynamic>{};
  }

  String _readMessage(dynamic responseBody, String fallback) {
    if (responseBody is Map<String, dynamic>) {
      final msg = responseBody['message'];
      if (msg != null && msg.toString().trim().isNotEmpty) {
        return msg.toString();
      }
    }
    return fallback;
  }

  bool _isSuccess(Map<String, dynamic> body) {
    final status = body['status'];
    if (status is bool) return status;
    final normalized = status?.toString().trim().toLowerCase() ?? '';
    if (normalized.isEmpty) return false;
    return normalized == 'true' ||
        normalized == 'success' ||
        normalized == 'ok' ||
        normalized == '1';
  }

  bool _looksLikeFailureMessage(String message) {
    final text = message.trim().toLowerCase();
    if (text.isEmpty) return false;
    return text.contains('gagal') ||
        text.contains('failed') ||
        text.contains('error') ||
        text.contains('invalid') ||
        text.contains('not found') ||
        text.contains('tidak bisa');
  }

  Future<Map<String, dynamic>> getNonPartList(String noSO) async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse(ApiConstants.listNonPart(noSO)),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final decoded = json.decode(response.body);
        List<dynamic> data;
        if (decoded is List) {
          data = decoded;
        } else if (decoded is Map<String, dynamic>) {
          final rawData = decoded['data'];
          data = rawData is List ? rawData : <dynamic>[];
        } else {
          data = <dynamic>[];
        }
        final list = data.map((item) => NonPart.fromJson(item)).toList();
        return {'status': true, 'data': list};
      } else {
        final responseBody = _tryDecodeMap(response.body);
        return {
          'status': false,
          'message': _readMessage(responseBody, 'Failed to fetch non-parts')
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> addNonPart({
    required String noSO,
    required String nonPartName,
    required int qty,
    required String remark,
    String? image,
  }) async {
    try {
      final headers = await _getHeaders();
      final body = {
        'NoSO': noSO,
        'noSO': noSO,
        'NonPartName': nonPartName,
        'nonPartName': nonPartName,
        'non_part_name': nonPartName,
        'Qty': qty,
        'qty': qty,
        'Remark': remark,
        'remark': remark,
        if (image != null) 'Image': image,
        if (image != null) 'image': image,
      };

      final response = await http.post(
        Uri.parse(ApiConstants.addNonPart),
        headers: headers,
        body: json.encode(body),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final responseBody = _tryDecodeMap(response.body);
        final hasExplicitFailure = responseBody.isNotEmpty &&
            responseBody.containsKey('status') &&
            !_isSuccess(responseBody);
        if (!hasExplicitFailure) {
          return {
            'status': true,
            'message': _readMessage(responseBody, 'Non-part berhasil ditambahkan')
          };
        }
        return {
          'status': false,
          'message': _readMessage(responseBody, 'Failed to add non-part')
        };
      } else {
        final responseBody = _tryDecodeMap(response.body);
        return {
          'status': false,
          'message': _readMessage(responseBody, 'Failed to add non-part')
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> updateNonPart({
    required int idNonPart,
    required String nonPartName,
    required int qty,
    required String remark,
    String? image,
  }) async {
    try {
      final headers = await _getHeaders();
      final body = {
        'NonPartName': nonPartName,
        'Qty': qty,
        'Remark': remark,
        if (image != null) 'Image': image,
      };

      final response = await http.put(
        Uri.parse(ApiConstants.updateNonPart(idNonPart)),
        headers: headers,
        body: json.encode(body),
      );

      if (response.statusCode == 200) {
        final responseBody = _tryDecodeMap(response.body);
        final hasExplicitFailure = responseBody.isNotEmpty &&
            responseBody.containsKey('status') &&
            !_isSuccess(responseBody);
        if (!hasExplicitFailure) {
          return {
            'status': true,
            'message':
                _readMessage(responseBody, 'Non-part berhasil diupdate')
          };
        }
        return {
          'status': false,
          'message': _readMessage(responseBody, 'Failed to update non-part')
        };
      } else {
        final responseBody = _tryDecodeMap(response.body);
        return {
          'status': false,
          'message': _readMessage(responseBody, 'Failed to update non-part')
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> deleteNonParts(List<int> ids) async {
    try {
      final headers = await _getHeaders();
      final response = await http.post(
        Uri.parse(ApiConstants.deleteNonPart),
        headers: headers,
        body: json.encode({
          'idParts': ids.map((id) => id.toString()).toList(),
          'ids': ids,
        }),
      );

      if (response.statusCode == 200) {
        final responseBody = _tryDecodeMap(response.body);
        final msg = _readMessage(responseBody, 'Deleted successfully');
        final hasExplicitStatus = responseBody.containsKey('status');
        final successByBody = _isSuccess(responseBody);
        final successWithoutStatus =
            !hasExplicitStatus && !_looksLikeFailureMessage(msg);
        if (responseBody.isEmpty || successByBody || successWithoutStatus) {
          return {'status': true, 'message': msg};
        }
        return {'status': false, 'message': msg};
      } else {
        final responseBody = _tryDecodeMap(response.body);
        if (response.statusCode == 404 || response.statusCode == 405) {
          final fallbackResponse = await http.delete(
            Uri.parse(ApiConstants.deleteNonPart),
            headers: headers,
            body: json.encode({'ids': ids}),
          );
          if (fallbackResponse.statusCode == 200) {
            final fallbackBody = _tryDecodeMap(fallbackResponse.body);
            final msg = _readMessage(fallbackBody, 'Deleted successfully');
            final hasExplicitStatus = fallbackBody.containsKey('status');
            final successByBody = _isSuccess(fallbackBody);
            final successWithoutStatus =
                !hasExplicitStatus && !_looksLikeFailureMessage(msg);
            if (fallbackBody.isEmpty || successByBody || successWithoutStatus) {
              return {'status': true, 'message': msg};
            }
          }
        }
        return {
          'status': false,
          'message': _readMessage(responseBody, 'Failed to delete')
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }
}
