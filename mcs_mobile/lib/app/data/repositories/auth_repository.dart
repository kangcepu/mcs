import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';
import '../../core/services/push_notification_service.dart';
import '../../core/utils/api_error_helper.dart';
import '../models/user_model.dart';

class AuthRepository {
  final ApiService _apiService = ApiService();

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.login,
        data: {
          'username': username,
          'password': password,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final responseData = (data['data'] is Map<String, dynamic>)
              ? data['data'] as Map<String, dynamic>
              : <String, dynamic>{};
          final requiresPasswordChange =
              responseData['requires_password_change'] == true;

          if (requiresPasswordChange) {
            await logout();
            return data;
          }

          final prefs = await SharedPreferences.getInstance();

          final token = responseData['token']?.toString() ?? '';
          await prefs.setString('token', token);

          try {
            final userData = responseData['user'];

            if (userData != null) {
              await prefs.setString('user_data', json.encode(userData));

              await prefs.setString(
                  'user_id', userData['id_user']?.toString() ?? '');
              await prefs.setString(
                  'username', userData['username']?.toString() ?? '');
              await prefs.setString(
                  'fullname', userData['fullname']?.toString() ?? '');
              await prefs.setString(
                  'id_position', userData['id_position']?.toString() ?? '');
              await prefs.setString(
                  'avatar', userData['avatar']?.toString() ?? '');

              if (userData['division'] != null && userData['division'] is Map) {
                final divisionData = userData['division'];
                final divisionId =
                    divisionData['id_division']?.toString() ?? '';
                await prefs.setString('division_id', divisionId);
                await prefs.setString('id_division', divisionId);
                await prefs.setString('division_code',
                    divisionData['division_code']?.toString() ?? '');
                await prefs.setString('division_name',
                    divisionData['division_name']?.toString() ?? '');
              }

              if (userData['permissions'] != null &&
                  userData['permissions'] is Map) {
                final perms = userData['permissions'];

                int parsePermission(dynamic value) {
                  if (value == null) return 0;
                  if (value is int) return value;
                  if (value is String) return int.tryParse(value) ?? 0;
                  return 0;
                }

                await prefs.setInt('wo_it', parsePermission(perms['wo_it']));
                await prefs.setInt('wo_mtc', parsePermission(perms['wo_mtc']));
                await prefs.setInt(
                    'wo_mtc_all', parsePermission(perms['wo_mtc_all']));
                await prefs.setInt('wo_cross_access',
                    parsePermission(perms['wo_cross_access']));
                await prefs.setInt('wo_ga', parsePermission(perms['wo_ga']));
                await prefs.setInt(
                    'wo_operational', parsePermission(perms['wo_operational']));
                await prefs.setInt(
                    'wo_preventive', parsePermission(perms['wo_preventive']));
                await prefs.setInt(
                    'wo_executor', parsePermission(perms['wo_executor']));
                await prefs.setInt(
                    'wo_void', parsePermission(perms['wo_void']));
                await prefs.setInt('scanning_create_wo',
                    parsePermission(perms['scanning_create_wo']));
                await prefs.setInt(
                    'scanning_edit', parsePermission(perms['scanning_edit']));
                await prefs.setInt(
                    'daily_control', parsePermission(perms['daily_control']));
                await prefs.setInt('daily_control_all',
                    parsePermission(perms['daily_control_all']));
                await prefs.setInt('wo_category_general',
                    parsePermission(perms['wo_category_general']));
                await prefs.setInt('wo_category_electrical',
                    parsePermission(perms['wo_category_electrical']));
                await prefs.setInt('wo_category_mould',
                    parsePermission(perms['wo_category_mould']));
                await prefs.setInt('mtc_area_gsu_wnb',
                    parsePermission(perms['mtc_area_gsu_wnb']));
                await prefs.setInt('mtc_area_gsu_inject',
                    parsePermission(perms['mtc_area_gsu_inject']));
                await prefs.setInt('mtc_area_ru_sawmill',
                    parsePermission(perms['mtc_area_ru_sawmill']));
                await prefs.setInt('mtc_area_ru_production',
                    parsePermission(perms['mtc_area_ru_production']));
                await prefs.setInt('privilage_asset',
                    parsePermission(perms['privilage_asset']));
                await prefs.setInt(
                    'asset_mutation', parsePermission(perms['asset_mutation']));
                await prefs.setInt('report_asset_mutation',
                    parsePermission(perms['report_asset_mutation']));
                await prefs.setInt('approval_asset_mutation',
                    parsePermission(perms['approval_asset_mutation']));
                await prefs.setInt(
                    'approval_all', parsePermission(perms['approval_all']));
                await prefs.setInt(
                    'report_asset', parsePermission(perms['report_asset']));
                await prefs.setInt('report_asset_history',
                    parsePermission(perms['report_asset_history']));
                await prefs.setInt(
                    'list_of_asset', parsePermission(perms['list_of_asset']));
                await prefs.setInt(
                    'recap_wo', parsePermission(perms['recap_wo']));
                await prefs.setInt(
                    'report_cr', parsePermission(perms['report_cr']));
                await prefs.setInt(
                    'report_so', parsePermission(perms['report_so']));
              }
            }
          } catch (e) {
            print('Error saving user data: $e');
          }

          await PushNotificationService.instance.syncTokenWithBackend();

          return data;
        } else {
          throw Exception(data['message'] ?? 'Login failed');
        }
      } else {
        throw Exception('Failed to login: ${response.statusCode}');
      }
    } on DioException catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Login gagal. Silakan coba lagi.',
        ),
      );
    } catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Login gagal. Silakan coba lagi.',
        ),
      );
    }
  }

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<String?> getDivisionId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('division_id') ?? prefs.getString('id_division');
  }

  Future<bool> isLoggedIn() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }

  Future<void> logout() async {
    await PushNotificationService.instance.unregisterCurrentToken();
    await PushNotificationService.instance.clearDailyControlBadgeCount();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('user_data');
    await prefs.remove('division_id');
    await prefs.clear();
  }

  Future<bool> validateToken() async {
    try {
      final response = await _apiService.post(ApiConstants.validate);

      if (response.statusCode == 200) {
        final data = response.data;
        return data['status'] == true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  Future<User> getProfile() async {
    try {
      final response = await _apiService.get(ApiConstants.profile);

      if (response.statusCode == 200) {
        final data = response.data;

        if (data['status'] == true) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('user_data', json.encode(data['data']));
          await prefs.setString(
              'id_position', data['data']['id_position']?.toString() ?? '');
          await prefs.setString(
              'fullname', data['data']['fullname']?.toString() ?? '');

          if (data['data']['division'] != null) {
            final divisionData = data['data']['division'];
            final divisionId = divisionData['id_division']?.toString() ?? '';
            await prefs.setString('division_id', divisionId);
            await prefs.setString('id_division', divisionId);
            await prefs.setString('division_code',
                divisionData['division_code']?.toString() ?? '');
            await prefs.setString('division_name',
                divisionData['division_name']?.toString() ?? '');
          }

          if (data['data']['permissions'] != null &&
              data['data']['permissions'] is Map) {
            final perms = data['data']['permissions'] as Map;

            int parsePermission(dynamic value) {
              if (value == null) return 0;
              if (value is int) return value;
              if (value is String) return int.tryParse(value) ?? 0;
              return 0;
            }

            await prefs.setInt('wo_it', parsePermission(perms['wo_it']));
            await prefs.setInt('wo_mtc', parsePermission(perms['wo_mtc']));
            await prefs.setInt(
                'wo_mtc_all', parsePermission(perms['wo_mtc_all']));
            await prefs.setInt(
                'wo_cross_access', parsePermission(perms['wo_cross_access']));
            await prefs.setInt('wo_ga', parsePermission(perms['wo_ga']));
            await prefs.setInt(
                'wo_operational', parsePermission(perms['wo_operational']));
            await prefs.setInt(
                'wo_preventive', parsePermission(perms['wo_preventive']));
            await prefs.setInt(
                'wo_executor', parsePermission(perms['wo_executor']));
            await prefs.setInt('wo_void', parsePermission(perms['wo_void']));
            await prefs.setInt('scanning_create_wo',
                parsePermission(perms['scanning_create_wo']));
            await prefs.setInt(
                'scanning_edit', parsePermission(perms['scanning_edit']));
            await prefs.setInt(
                'daily_control', parsePermission(perms['daily_control']));
            await prefs.setInt('daily_control_all',
                parsePermission(perms['daily_control_all']));
            await prefs.setInt('wo_category_general',
                parsePermission(perms['wo_category_general']));
            await prefs.setInt('wo_category_electrical',
                parsePermission(perms['wo_category_electrical']));
            await prefs.setInt('wo_category_mould',
                parsePermission(perms['wo_category_mould']));
            await prefs.setInt(
                'mtc_area_gsu_wnb', parsePermission(perms['mtc_area_gsu_wnb']));
            await prefs.setInt('mtc_area_gsu_inject',
                parsePermission(perms['mtc_area_gsu_inject']));
            await prefs.setInt('mtc_area_ru_sawmill',
                parsePermission(perms['mtc_area_ru_sawmill']));
            await prefs.setInt('mtc_area_ru_production',
                parsePermission(perms['mtc_area_ru_production']));
            await prefs.setInt(
                'privilage_asset', parsePermission(perms['privilage_asset']));
            await prefs.setInt(
                'asset_mutation', parsePermission(perms['asset_mutation']));
            await prefs.setInt('report_asset_mutation',
                parsePermission(perms['report_asset_mutation']));
            await prefs.setInt('approval_asset_mutation',
                parsePermission(perms['approval_asset_mutation']));
            await prefs.setInt(
                'approval_all', parsePermission(perms['approval_all']));
            await prefs.setInt(
                'report_asset', parsePermission(perms['report_asset']));
            await prefs.setInt('report_asset_history',
                parsePermission(perms['report_asset_history']));
            await prefs.setInt(
                'list_of_asset', parsePermission(perms['list_of_asset']));
            await prefs.setInt('recap_wo', parsePermission(perms['recap_wo']));
            await prefs.setInt(
                'report_cr', parsePermission(perms['report_cr']));
            await prefs.setInt(
                'report_so', parsePermission(perms['report_so']));
          }

          return User.fromJson(data['data']);
        } else {
          throw Exception(data['message'] ?? 'Failed to get profile');
        }
      } else {
        throw Exception('Failed to get profile: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Get profile error: $e');
    }
  }

  Future<void> uploadAvatar(String filePath) async {
    try {
      final form = FormData.fromMap({
        'avatar': await MultipartFile.fromFile(filePath),
      });
      final response = await _apiService.post(
        ApiConstants.profileAvatar,
        data: form,
      );
      if (response.statusCode != 200) {
        throw Exception('Gagal mengunggah foto: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal mengunggah foto profil. Silakan coba lagi.',
        ),
      );
    }
  }

  Future<void> removeAvatar() async {
    try {
      final response = await _apiService.delete(ApiConstants.profileAvatar);
      if (response.statusCode != 200) {
        throw Exception('Gagal menghapus foto: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal menghapus foto profil. Silakan coba lagi.',
        ),
      );
    }
  }

  Future<Map<String, dynamic>> changePassword({
    required String username,
    required String currentPassword,
    required String password,
    required String confirmPassword,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.changePassword,
        data: {
          'username': username,
          'current_password': currentPassword,
          'password': password,
          'confirm_password': confirmPassword,
        },
      );

      final data = response.data;
      if (response.statusCode == 200 && data is Map<String, dynamic>) {
        return data;
      }

      throw Exception('Failed to change password: ${response.statusCode}');
    } on DioException catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal mengganti password. Silakan coba lagi.',
        ),
      );
    } catch (e) {
      throw Exception(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal mengganti password. Silakan coba lagi.',
        ),
      );
    }
  }
}
