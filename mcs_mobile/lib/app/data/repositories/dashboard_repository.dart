import 'package:dio/dio.dart';
import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';

class DashboardRepository {
  final ApiService _apiService = ApiService();

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
        ApiConstants.dashboardWo,
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
        throw Exception('Failed to get dashboard stats: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(errorData['message'] ?? 'Failed to get dashboard stats');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Dashboard stats error: $e');
    }
    
  }
  
}
