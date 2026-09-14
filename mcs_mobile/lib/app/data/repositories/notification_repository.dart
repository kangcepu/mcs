import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/notification_model.dart';
import '../../core/constants/api_constants.dart';

class NotificationRepository {
  final Dio _dio = Dio();

  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    print('🔑 Token: ${token != null ? "Found" : "Not Found"}');
    return token;
  }

  Future<NotificationSummary> getNotificationSummary() async {
    try {
      final token = await _getToken();
      
      final url = '${ApiConstants.baseUrl}/notification/summary';
      print('🌐 Calling Notification API: $url');
      
      final response = await _dio.get(
        url,
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
          },
        ),
      );

      print('✅ Notification API Status: ${response.statusCode}');
      print('✅ Notification API Response: ${response.data}');

      return NotificationSummary.fromJson(response.data);
    } catch (e) {
      print('❌ Notification API Error: $e');
      if (e is DioException) {
        print('❌ DioException type: ${e.type}');
        print('❌ DioException message: ${e.message}');
        print('❌ DioException response: ${e.response?.data}');
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> getNotificationDetail(String woNumber) async {
    try {
      final token = await _getToken();
      
      final response = await _dio.get(
        '${ApiConstants.baseUrl}/notification/detail',
        queryParameters: {'wo_number': woNumber},
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
          },
        ),
      );

      return response.data;
    } catch (e) {
      print('❌ Error getting notification detail: $e');
      rethrow;
    }
  }
}