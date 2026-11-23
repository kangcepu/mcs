import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/stock_opname_model.dart';
import '../../core/constants/api_constants.dart';
import '../providers/api_service.dart';

class StockOpnameRepository {
  final ApiService _mcsApi = ApiService();
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

  Future<Map<String, dynamic>> getStockOpnameList() async {
    try {
      final response =
          await _mcsApi.get('/v2/stock-opname-schedules/work-items');
      final body = response.data;
      final payload = body is Map ? body['data'] : null;
      final items = payload is Map && payload['items'] is List
          ? payload['items'] as List
          : const [];
      final list = items
          .whereType<Map>()
          .map((item) =>
              StockOpname.fromJson(Map<String, dynamic>.from(item)))
          .toList();
      return {
        'status': true,
        'data': list,
        'can_manage': payload is Map && payload['can_manage'] == true,
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Gagal mengambil tugas Stock Opname'
      };
    }
  }

  Future<List<StockOpnameScheduleAssignment>> getMySchedules() async {
    try {
      final response = await _mcsApi.get('/v2/stock-opname-schedules/my');
      final body = response.data;
      final data = body is Map ? body['data'] : null;
      if (data is! List) return const [];
      return data
          .whereType<Map>()
          .map((item) => StockOpnameScheduleAssignment.fromJson(
              Map<String, dynamic>.from(item)))
          .toList();
    } catch (_) {
      // Migration scheduler bisa belum dijalankan saat mobile lebih dulu rilis.
      return const [];
    }
  }

  Future<Map<String, dynamic>> createStockOpname({
    required String tanggal,
    required List<String> idCompanies,
    required List<String> idCategories,
    required List<String> idLocations,
    required bool isBOM,
  }) async {
    try {
      final headers = await _getHeaders();
      final body = {
        "Tanggal": tanggal,
        "IdCompanies": idCompanies,
        "IdCategories": idCategories,
        "IdLocations": idLocations,
        "IsBOM": isBOM,
      };

      final response = await http.post(
        Uri.parse(ApiConstants.addNoSO),
        headers: headers,
        body: json.encode(body),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return {'status': true, 'message': 'Stock Opname created successfully'};
      } else {
        final responseBody = json.decode(response.body);
        return {
          'status': false,
          'message': responseBody['message'] ?? 'Failed to create stock opname'
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> deleteStockOpname(List<String> noSOList) async {
    try {
      final headers = await _getHeaders();
      final response = await http.delete(
        Uri.parse(ApiConstants.deleteNoSO),
        headers: headers,
        body: json.encode({"NoSO": noSOList}),
      );

      if (response.statusCode == 200) {
        return {'status': true, 'message': 'Deleted successfully'};
      } else {
        final responseBody = json.decode(response.body);
        return {
          'status': false,
          'message': responseBody['message'] ?? 'Failed to delete'
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> lockStockOpname(String noSO) async {
    try {
      final response = await _mcsApi.post(
        '/v2/stock-opname-operations/${Uri.encodeComponent(noSO)}/submit',
      );
      final body = response.data;
      return {
        'status': true,
        'message': body is Map
            ? body['message'] ?? 'Hasil count dikirim ke checker'
            : 'Hasil count dikirim ke checker'
      };
    } catch (e) {
      return {'status': false, 'message': 'Gagal submit hasil Stock Opname: $e'};
    }
  }

  Future<Map<String, dynamic>> getMasterCompanies() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse(ApiConstants.masterCompany),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final decoded = json.decode(response.body);
        if (decoded is Map<String, dynamic>) {
          return {'status': true, 'data': decoded};
        }
        if (decoded is List) {
          return {
            'status': true,
            'data': {'companies': decoded, 'categories': [], 'locations': []}
          };
        }
        return {'status': false, 'message': 'Invalid master data format'};
      } else {
        return {'status': false, 'message': 'Failed to fetch companies'};
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> getMasterData() async {
    return getMasterCompanies();
  }
}
