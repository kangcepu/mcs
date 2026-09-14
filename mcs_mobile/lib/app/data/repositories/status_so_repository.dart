import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants/api_constants.dart';
import '../models/status_so_model.dart';

class StatusSORepository {
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<Map<String, String>> _getHeaders({bool withAuth = true}) async {
    final token = await _getToken();
    return {
      'Content-Type': 'application/json',
      if (withAuth) 'Authorization': 'Bearer ${token ?? ''}',
    };
  }

  Future<Map<String, dynamic>> getStatuses() async {
    try {
      final response = await http.get(
        Uri.parse(ApiConstants.listStatusSO),
        headers: await _getHeaders(withAuth: false),
      );

      if (response.statusCode != 200) {
        return {
          'status': false,
          'message': 'Failed to load status (${response.statusCode})'
        };
      }

      final decoded = json.decode(response.body);
      final data =
          decoded is Map<String, dynamic> ? (decoded['data'] ?? []) : decoded;
      final statuses = (data as List<dynamic>)
          .map((item) => StatusSO.fromJson(item as Map<String, dynamic>))
          .toList();
      return {'status': true, 'data': statuses};
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect: $e'};
    }
  }

  Future<Map<String, dynamic>> createStatus(String status) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.addStatusSO),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return {'status': true};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': decoded['message'] ?? 'Failed to create status'
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect: $e'};
    }
  }

  Future<Map<String, dynamic>> updateStatus(int id, String status) async {
    try {
      final response = await http.put(
        Uri.parse(ApiConstants.updateStatusSO(id)),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );

      if (response.statusCode == 200) {
        return {'status': true};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': decoded['message'] ?? 'Failed to update status'
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect: $e'};
    }
  }

  Future<Map<String, dynamic>> deleteStatus(int id) async {
    try {
      final response = await http.delete(
        Uri.parse(ApiConstants.deleteStatusSO(id)),
        headers: await _getHeaders(),
      );

      if (response.statusCode == 200) {
        return {'status': true};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': decoded['message'] ?? 'Failed to delete status'
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect: $e'};
    }
  }
}
