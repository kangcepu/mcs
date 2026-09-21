import '../models/notification_model.dart';
import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';

class NotificationRepository {
  final ApiService _apiService = ApiService();

  Future<NotificationSummary> getNotificationSummary() async {
    final response = await _apiService.get(ApiConstants.notificationSummary);
    return NotificationSummary.fromJson(response.data);
  }

  Future<Map<String, dynamic>> getNotificationDetail(String woNumber) async {
    final response = await _apiService.get(
      ApiConstants.notificationDetail,
      queryParameters: {'wo_number': woNumber},
    );
    return response.data;
  }
}
