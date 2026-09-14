import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/stock_opname_model.dart';
import '../../core/constants/api_constants.dart';

class StockOpnameRepository {
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
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse(ApiConstants.listNoSO),
        headers: headers,
      );

      if (response.statusCode == 200) {
        List<dynamic> data = json.decode(response.body);
        final list = data.map((item) => StockOpname.fromJson(item)).toList();
        return {'status': true, 'data': list};
      } else if (response.statusCode == 401) {
        return {
          'status': false,
          'message': 'Unauthorized: Token is invalid or expired'
        };
      } else {
        final responseBody = json.decode(response.body);
        return {
          'status': false,
          'message': responseBody['message'] ??
              'Tidak ada Jadwal Stock Opname saat ini'
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
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
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse(ApiConstants.lockSO(noSO)),
        headers: headers,
      );

      if (response.statusCode == 200) {
        return {'status': true, 'message': 'Stock Opname locked successfully'};
      } else {
        final responseBody = json.decode(response.body);
        return {
          'status': false,
          'message': responseBody['message'] ?? 'Failed to lock'
        };
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
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
