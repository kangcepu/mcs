import 'dart:convert';

import 'package:dio/dio.dart';

import '../../core/constants/api_constants.dart';
import '../providers/api_service.dart';

class DailyControlRepository {
  final ApiService _apiService = ApiService();

  String _extractErrorMessage(dynamic errorData, String fallback) {
    if (errorData is Map<String, dynamic>) {
      final message = '${errorData['message'] ?? ''}'.trim();
      if (message.isNotEmpty) {
        return message;
      }
    }
    if (errorData is Map) {
      final mapped = Map<String, dynamic>.from(errorData);
      final message = '${mapped['message'] ?? ''}'.trim();
      if (message.isNotEmpty) {
        return message;
      }
    }
    if (errorData is String) {
      final message = errorData.trim();
      if (message.isNotEmpty) {
        return message;
      }
    }
    return fallback;
  }

  Future<Map<String, dynamic>> getDailyControlList({
    required String date,
    String? area,
  }) async {
    try {
      final Map<String, dynamic> queryParams = {'date': date};
      if (area != null && area.isNotEmpty && area.toUpperCase() != 'ALL') {
        queryParams['area'] = area.toLowerCase();
      }
      final response = await _apiService.get(
        ApiConstants.dailyControlList,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception(
        'Failed to get daily control list: ${response.statusCode}',
      );
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get daily control list'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Daily control list error: $e');
    }
  }

  Future<int> getUnreadCount() async {
    try {
      final response = await _apiService.get(ApiConstants.dailyControlUnreadCount);

      if (response.statusCode == 200) {
        final map = Map<String, dynamic>.from(response.data as Map);
        final data = map['data'];
        if (data is Map) {
          return int.tryParse('${data['total_unread'] ?? 0}') ?? 0;
        }
      }

      return 0;
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get unread count'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Unread count error: $e');
    }
  }

  Future<Map<String, dynamic>> getUnreadActivities({int limit = 100}) async {
    try {
      final response = await _apiService.get(
        ApiConstants.dailyControlUnreadActivities,
        queryParameters: {'limit': limit},
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception(
        'Failed to get unread activities: ${response.statusCode}',
      );
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get unread activities'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Unread activities error: $e');
    }
  }

  Future<Map<String, dynamic>> getScheduledSummary({
    required String date,
    String? division,
    String? mesoFilter,
    String? mtcCategory,
    String? mtcArea,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'date': date,
        if (division != null && division.trim().isNotEmpty) 'division': division.trim(),
        if (mesoFilter != null && mesoFilter.trim().isNotEmpty)
          'meso_filter': mesoFilter.trim(),
        if (mtcCategory != null && mtcCategory.trim().isNotEmpty)
          'mtc_category': mtcCategory.trim(),
        if (mtcArea != null && mtcArea.trim().isNotEmpty)
          'mtc_area': mtcArea.trim(),
      };

      final response = await _apiService.get(
        ApiConstants.dailyControlScheduledSummary,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception(
        'Failed to get daily control scheduled summary: ${response.statusCode}',
      );
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(
            errorData,
            'Failed to get daily control scheduled summary',
          ),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Daily control scheduled summary error: $e');
    }
  }

  Future<Map<String, dynamic>> createDailyControl({
    required String activityDate,
    required String notes,
    String? title,
    String? woNumber,
    String? assetCode,
    String? partMesin,
    List<int> tagUserIds = const [],
    List<Map<String, dynamic>> followups = const [],
    List<Map<String, String>> mediaFiles = const [],
    String status = 'POSTED',
  }) async {
    try {
      final hasMedia = mediaFiles.isNotEmpty;

      dynamic requestPayload;
      Options? requestOptions;

      if (hasMedia) {
        final formData = FormData();

        void addField(String key, String? value) {
          final v = value?.trim() ?? '';
          if (v.isNotEmpty) {
            formData.fields.add(MapEntry(key, v));
          }
        }

        addField('activity_date', activityDate);
        addField('notes', notes);
        addField('status', status);
        addField('title', title);
        addField('wo_number', woNumber);
        addField('asset_code', assetCode);
        addField('part_mesin', partMesin);

        for (final tag in tagUserIds) {
          if (tag > 0) {
            formData.fields.add(MapEntry('tag_user_ids[]', '$tag'));
          }
        }

        if (followups.isNotEmpty) {
          formData.fields.add(MapEntry('followups', jsonEncode(followups)));
        }

        for (final media in mediaFiles) {
          final filePath = (media['path'] ?? '').trim();
          if (filePath.isEmpty) {
            continue;
          }

          final filename = filePath.split(RegExp(r'[\\/]')).last;
          final mediaType = (media['media_type'] ?? '').trim();
          final capturedAt = (media['captured_at'] ?? '').trim();

          formData.files.add(
            MapEntry(
              'media_files[]',
              await MultipartFile.fromFile(filePath, filename: filename),
            ),
          );

          if (mediaType.isNotEmpty) {
            formData.fields.add(MapEntry('media_types[]', mediaType));
          }
          if (capturedAt.isNotEmpty) {
            formData.fields.add(MapEntry('media_captured_at[]', capturedAt));
          }
        }

        requestPayload = formData;
        requestOptions = Options(contentType: 'multipart/form-data');
      } else {
        requestPayload = <String, dynamic>{
          'activity_date': activityDate,
          'notes': notes,
          'status': status,
          if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
          if (woNumber != null && woNumber.trim().isNotEmpty)
            'wo_number': woNumber.trim(),
          if (assetCode != null && assetCode.trim().isNotEmpty)
            'asset_code': assetCode.trim(),
          if (partMesin != null && partMesin.trim().isNotEmpty)
            'part_mesin': partMesin.trim(),
          'tag_user_ids': tagUserIds,
          'followups': followups,
        };
      }

      final response = await _apiService.post(
        ApiConstants.dailyControlCreate,
        data: requestPayload,
        options: requestOptions,
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }

      throw Exception('Failed to create daily control: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to create daily control'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Create daily control error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getAssetOptions({String term = ''}) async {
    try {
      final response = await _apiService.get(
        ApiConstants.dailyControlAssetOptions,
        queryParameters: {'term': term},
      );

      if (response.statusCode == 200) {
        final map = Map<String, dynamic>.from(response.data as Map);
        final data = map['data'];
        if (data is Map && data['items'] is List) {
          return (data['items'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
        if (map['results'] is List) {
          return (map['results'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
      }

      return [];
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get asset options'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Asset options error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getAssetPartOptions({
    required String assetCode,
  }) async {
    if (assetCode.trim().isEmpty) {
      return [];
    }

    try {
      final response = await _apiService.get(
        ApiConstants.dailyControlAssetPartOptions,
        queryParameters: {'asset_code': assetCode.trim()},
      );

      if (response.statusCode == 200) {
        final map = Map<String, dynamic>.from(response.data as Map);
        final data = map['data'];
        if (data is Map && data['items'] is List) {
          return (data['items'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
        if (map['results'] is List) {
          return (map['results'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
      }

      return [];
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get asset part options'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Asset part options error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getWoOptions({
    String term = '',
    String assetCode = '',
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.dailyControlWoOptions,
        queryParameters: {
          'term': term,
          if (assetCode.trim().isNotEmpty) 'asset_code': assetCode.trim(),
        },
      );

      if (response.statusCode == 200) {
        final map = Map<String, dynamic>.from(response.data as Map);
        final data = map['data'];
        if (data is Map && data['items'] is List) {
          return (data['items'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
        if (map['results'] is List) {
          return (map['results'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
      }

      return [];
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get WO options'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('WO options error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getComments({
    required int dailyControlId,
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.dailyControlComments,
        queryParameters: {'daily_control_id': dailyControlId},
      );

      if (response.statusCode == 200) {
        final map = Map<String, dynamic>.from(response.data as Map);
        final data = map['data'];
        if (data is Map && data['items'] is List) {
          return (data['items'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
      }
      return [];
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get comments'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Get comments error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getPartMentions({
    required int dailyControlId,
  }) async {
    try {
      final response = await _apiService.get(
        ApiConstants.dailyControlPartMentions,
        queryParameters: {'daily_control_id': dailyControlId},
      );

      if (response.statusCode == 200) {
        final map = Map<String, dynamic>.from(response.data as Map);
        final data = map['data'];
        if (data is Map && data['items'] is List) {
          return (data['items'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        }
      }
      return [];
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to get part mentions'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Get part mentions error: $e');
    }
  }

  Future<Map<String, dynamic>> createComment({
    required int dailyControlId,
    required String message,
    int? parentId,
    List<String> mediaFilePaths = const [],
  }) async {
    try {
      final hasMedia = mediaFilePaths.isNotEmpty;
      dynamic payload;
      Options? requestOptions;

      if (hasMedia) {
        final formData = FormData.fromMap({
          'daily_control_id': '$dailyControlId',
          'message': message,
          if (parentId != null && parentId > 0) 'parent_id': '$parentId',
        });

        for (final filePath in mediaFilePaths) {
          final path = filePath.trim();
          if (path.isEmpty) {
            continue;
          }
          final filename = path.split(RegExp(r'[\\/]')).last;
          formData.files.add(
            MapEntry(
              'comment_media_files[]',
              await MultipartFile.fromFile(path, filename: filename),
            ),
          );
        }

        payload = formData;
        requestOptions = Options(contentType: 'multipart/form-data');
      } else {
        payload = {
          'daily_control_id': dailyControlId,
          'message': message,
          if (parentId != null && parentId > 0) 'parent_id': parentId,
        };
      }

      final response = await _apiService.post(
        ApiConstants.dailyControlCommentCreate,
        data: payload,
        options: requestOptions,
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }
      throw Exception('Failed to create comment: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to create comment'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Create comment error: $e');
    }
  }

  Future<Map<String, dynamic>> markAsRead({
    required int dailyControlId,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.dailyControlMarkRead,
        data: {
          'daily_control_id': dailyControlId,
        },
      );

      if (response.statusCode == 200) {
        return Map<String, dynamic>.from(response.data as Map);
      }
      throw Exception('Failed to mark as read: ${response.statusCode}');
    } on DioException catch (e) {
      if (e.response != null) {
        final errorData = e.response!.data;
        throw Exception(
          _extractErrorMessage(errorData, 'Failed to mark as read'),
        );
      }
      throw Exception('Network error: ${e.message}');
    } catch (e) {
      throw Exception('Mark as read error: $e');
    }
  }
}
