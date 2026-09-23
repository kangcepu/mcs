// ignore_for_file: use_build_context_synchronously

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/services/push_notification_service.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/app_date_picker_helper.dart';
import '../../../core/utils/daily_control_image_editor_helper.dart';
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/utils/media_timestamp_helper.dart';
import '../../../data/repositories/daily_control_repository.dart';

class DailyControlLookupOption {
  final String value;
  final String label;

  const DailyControlLookupOption({required this.value, required this.label});
}

class DailyControlDraftMedia {
  final String localPath;
  final String mediaType;
  final DateTime capturedAt;

  const DailyControlDraftMedia({
    required this.localPath,
    required this.mediaType,
    required this.capturedAt,
  });

  bool get isImage => mediaType == 'image';
  bool get isVideo => mediaType == 'video';
  String get capturedAtIso => capturedAt.toIso8601String();
  String get capturedAtLabel =>
      DateFormat('yyyy-MM-dd HH:mm:ss').format(capturedAt);

  File get file => File(localPath);
}

class DailyControlUser {
  final int idUser;
  final String name;
  final String fullname;
  final String alias;
  final String role;
  final String idPosition;
  final String divisionCode;
  final int woCategoryGeneral;
  final int woCategoryElectrical;
  final int woCategoryMould;
  final int mtcAreaGsuWnb;
  final int mtcAreaGsuInject;
  final int mtcAreaRuSawmill;
  final int mtcAreaRuProduction;

  const DailyControlUser({
    required this.idUser,
    required this.name,
    required this.fullname,
    required this.alias,
    required this.role,
    required this.idPosition,
    required this.divisionCode,
    required this.woCategoryGeneral,
    required this.woCategoryElectrical,
    required this.woCategoryMould,
    required this.mtcAreaGsuWnb,
    required this.mtcAreaGsuInject,
    required this.mtcAreaRuSawmill,
    required this.mtcAreaRuProduction,
  });

  factory DailyControlUser.fromJson(Map<String, dynamic> json) {
    int parseInt(dynamic value) {
      if (value == null) return 0;
      if (value is int) return value;
      if (value is String) return int.tryParse(value) ?? 0;
      return 0;
    }

    final alias = '${json['alias'] ?? ''}'.trim();
    final displayName = '${json['display_name'] ?? ''}'.trim();
    final fullname = '${json['fullname'] ?? ''}'.trim();

    return DailyControlUser(
      idUser: int.tryParse('${json['id_user'] ?? 0}') ?? 0,
      name: alias.isNotEmpty
          ? alias
          : (displayName.isNotEmpty ? displayName : fullname),
      fullname: fullname,
      alias: alias,
      role: '${json['division_name'] ?? json['id_position'] ?? '-'}'.trim(),
      idPosition: '${json['id_position'] ?? ''}'.trim(),
      divisionCode: '${json['division_code'] ?? ''}'.trim(),
      woCategoryGeneral: parseInt(json['wo_category_general']),
      woCategoryElectrical: parseInt(json['wo_category_electrical']),
      woCategoryMould: parseInt(json['wo_category_mould']),
      mtcAreaGsuWnb: parseInt(json['mtc_area_gsu_wnb']),
      mtcAreaGsuInject: parseInt(json['mtc_area_gsu_inject']),
      mtcAreaRuSawmill: parseInt(json['mtc_area_ru_sawmill']),
      mtcAreaRuProduction: parseInt(json['mtc_area_ru_production']),
    );
  }

  String get preferredDisplayName {
    final aliasName = alias.trim();
    if (aliasName.isNotEmpty) return aliasName;

    final resolvedName = name.trim();
    if (resolvedName.isNotEmpty) return resolvedName;

    return fullname.trim();
  }

  bool hasMtcArea(String areaKey) {
    switch (areaKey.toUpperCase()) {
      case 'GSU_WNB':
        return mtcAreaGsuWnb == 1;
      case 'GSU_INJECT':
        return mtcAreaGsuInject == 1;
      case 'RU_SAWMILL':
        return mtcAreaRuSawmill == 1;
      case 'RU_PRODUCTION':
        return mtcAreaRuProduction == 1;
      default:
        return false;
    }
  }

  bool get hasAnyMtcCategory =>
      woCategoryGeneral == 1 ||
      woCategoryElectrical == 1 ||
      woCategoryMould == 1;

  bool hasMtcCategory(String categoryKey) {
    switch (categoryKey.toUpperCase()) {
      case 'GENERAL':
        return woCategoryGeneral == 1;
      case 'ELECTRICAL':
        return woCategoryElectrical == 1;
      case 'MOULD':
        return woCategoryMould == 1;
      default:
        return false;
    }
  }

  bool get isExecutorAdmin =>
      idPosition.trim().toUpperCase() == 'EXECUTOR_ADMIN';
}

class DailyControlMedia {
  final int id;
  final String mediaType;
  final String mediaName;
  final String mediaPath;
  final String mediaUrl;

  const DailyControlMedia({
    required this.id,
    required this.mediaType,
    required this.mediaName,
    required this.mediaPath,
    required this.mediaUrl,
  });

  bool get isVideo => mediaType == 'video';

  factory DailyControlMedia.fromJson(Map<String, dynamic> json) {
    final path = '${json['media_path'] ?? ''}'.trim();
    final name = '${json['media_name'] ?? ''}'.trim();
    final source = '${json['media_url'] ?? ''}'.trim().isNotEmpty
        ? '${json['media_url'] ?? ''}'.trim()
        : (path.isNotEmpty ? path : name);
    return DailyControlMedia(
      id: int.tryParse('${json['id'] ?? 0}') ?? 0,
      mediaType: '${json['media_type'] ?? 'image'}'.trim().toLowerCase(),
      mediaName: name,
      mediaPath: path,
      mediaUrl: _resolveMediaUrl(source),
    );
  }

  static String _resolveMediaUrl(String rawPath) {
    final normalized = rawPath.trim().replaceAll('\\', '/');
    if (normalized.isEmpty) {
      return '';
    }
    final selectedBaseUri = Uri.parse('${ApiConstants.apiOrigin}/');
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      final parsed = Uri.tryParse(normalized);
      if (parsed == null || parsed.host.isEmpty) {
        return Uri.encodeFull(normalized);
      }

      final isPrivateOrigin = _isPrivateMediaHost(parsed.host);
      final isPublicMcsHttp = parsed.host.toLowerCase() == 'mcs.padmoasm.com' &&
          parsed.scheme.toLowerCase() == 'http';
      if (!isPrivateOrigin && !isPublicMcsHttp) {
        return parsed.toString();
      }

      final targetBaseUri = isPublicMcsHttp
          ? Uri.parse('https://mcs.padmoasm.com/')
          : selectedBaseUri;
      return _resolvePathAgainstBase(
        targetBaseUri,
        parsed.path,
        query: parsed.hasQuery ? parsed.query : null,
      );
    }

    return _resolvePathAgainstBase(selectedBaseUri, normalized);
  }

  static String _resolvePathAgainstBase(
    Uri baseUri,
    String rawPath, {
    String? query,
  }) {
    var cleanedPath = rawPath.trim().replaceAll('\\', '/');
    while (cleanedPath.startsWith('/')) {
      cleanedPath = cleanedPath.substring(1);
    }
    if (cleanedPath.toLowerCase().startsWith('mcs/')) {
      cleanedPath = cleanedPath.substring(4);
    }

    final resolved = baseUri.resolveUri(Uri(path: cleanedPath));
    return query == null || query.isEmpty
        ? resolved.toString()
        : resolved.replace(query: query).toString();
  }

  static bool _isPrivateMediaHost(String host) {
    final normalized = host.trim().toLowerCase();
    if (normalized == 'localhost' ||
        normalized == '127.0.0.1' ||
        normalized == '::1' ||
        normalized == '10.0.2.2') {
      return true;
    }

    final octets = normalized.split('.').map(int.tryParse).toList();
    if (octets.length != 4 || octets.any((value) => value == null)) {
      return false;
    }

    final a = octets[0]!;
    final b = octets[1]!;
    return a == 10 ||
        a == 127 ||
        (a == 172 && b >= 16 && b <= 31) ||
        (a == 192 && b == 168);
  }
}

class DailyControlFollowUp {
  final String text;
  final bool done;

  const DailyControlFollowUp({required this.text, required this.done});

  factory DailyControlFollowUp.fromJson(Map<String, dynamic> json) {
    final status = '${json['status'] ?? 'OPEN'}'.toUpperCase();
    return DailyControlFollowUp(
      text: '${json['description'] ?? json['text'] ?? ''}',
      done: status == 'DONE',
    );
  }
}

class DailyControlComment {
  final int id;
  final int parentId;
  final int dailyControlId;
  final int idUser;
  final String fullname;
  final String divisionName;
  final String message;
  final String createdAt;
  final List<DailyControlMedia> media;
  final List<DailyControlComment> replies;
  final String localStatus;

  const DailyControlComment({
    required this.id,
    required this.parentId,
    required this.dailyControlId,
    required this.idUser,
    required this.fullname,
    required this.divisionName,
    required this.message,
    required this.createdAt,
    required this.media,
    required this.replies,
    this.localStatus = 'sent',
  });

  factory DailyControlComment.fromJson(Map<String, dynamic> json) {
    final replyRows = (json['replies'] as List?) ?? const [];
    final mediaRows = (json['media'] as List?) ?? const [];
    return DailyControlComment(
      id: int.tryParse('${json['id'] ?? 0}') ?? 0,
      parentId: int.tryParse('${json['parent_id'] ?? 0}') ?? 0,
      dailyControlId: int.tryParse('${json['daily_control_id'] ?? 0}') ?? 0,
      idUser: int.tryParse('${json['id_user'] ?? 0}') ?? 0,
      fullname: '${json['display_name'] ?? json['fullname'] ?? '-'}'.trim(),
      divisionName: '${json['division_name'] ?? '-'}'.trim(),
      message: '${json['message'] ?? ''}'.trim(),
      createdAt: '${json['created_at'] ?? ''}'.trim(),
      media: mediaRows
          .map(
            (item) => DailyControlMedia.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .where((item) => item.mediaUrl.isNotEmpty)
          .toList(),
      replies: replyRows
          .map(
            (item) => DailyControlComment.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
      localStatus: '${json['local_status'] ?? 'sent'}'.trim(),
    );
  }

  List<DailyControlMedia> get imageMedia =>
      media.where((item) => item.mediaType == 'image').toList();

  bool get isPending => localStatus == 'pending';
  bool get isFailed => localStatus == 'failed';

  DailyControlComment copyWith({
    int? id,
    int? parentId,
    int? dailyControlId,
    int? idUser,
    String? fullname,
    String? divisionName,
    String? message,
    String? createdAt,
    List<DailyControlMedia>? media,
    List<DailyControlComment>? replies,
    String? localStatus,
  }) {
    return DailyControlComment(
      id: id ?? this.id,
      parentId: parentId ?? this.parentId,
      dailyControlId: dailyControlId ?? this.dailyControlId,
      idUser: idUser ?? this.idUser,
      fullname: fullname ?? this.fullname,
      divisionName: divisionName ?? this.divisionName,
      message: message ?? this.message,
      createdAt: createdAt ?? this.createdAt,
      media: media ?? this.media,
      replies: replies ?? this.replies,
      localStatus: localStatus ?? this.localStatus,
    );
  }
}

class DailyControlPartMention {
  final String id;
  final int customDetailId;
  final String partName;
  final String sectionName;
  final String scheduleType;
  final String maintenanceStatus;
  final String notes;
  final String mentionText;
  final String subtitle;

  const DailyControlPartMention({
    required this.id,
    required this.customDetailId,
    required this.partName,
    required this.sectionName,
    required this.scheduleType,
    required this.maintenanceStatus,
    required this.notes,
    required this.mentionText,
    required this.subtitle,
  });

  factory DailyControlPartMention.fromJson(Map<String, dynamic> json) {
    return DailyControlPartMention(
      id: '${json['id'] ?? ''}'.trim(),
      customDetailId: int.tryParse('${json['custom_detail_id'] ?? 0}') ?? 0,
      partName: '${json['part_name'] ?? json['text'] ?? ''}'.trim(),
      sectionName: '${json['section_name'] ?? ''}'.trim(),
      scheduleType: '${json['schedule_type'] ?? ''}'.trim(),
      maintenanceStatus: '${json['maintenance_status'] ?? ''}'.trim(),
      notes: '${json['notes'] ?? ''}'.trim(),
      mentionText: '${json['mention_text'] ?? ''}'.trim(),
      subtitle: '${json['subtitle'] ?? ''}'.trim(),
    );
  }
}

class DailyControlActivity {
  final int id;
  final int idUser;
  final String user;
  final String division;
  final String divisionCode;
  final String date;
  final String time;
  final String title;
  final String notes;
  final String assetCode;
  final String assetName;
  final String partMesin;
  final String woNumber;
  final String maintenanceKind;
  final String maintenanceActionLabel;
  final String requestPartLabel;
  final String executorCodeRaw;
  final String mesoSubtype;
  final String sourceTable;
  final String mtcAreaKey;
  final List<DailyControlMedia> media;
  final int commentCount;
  final int unreadCount;
  final List<String> tags;
  final List<DailyControlFollowUp> followUps;
  final List<int> participantUserIds;
  final List<String> participantNames;
  final List<String> laborNames;
  final List<String> readerNames;
  final String displayFullname;

  const DailyControlActivity({
    required this.id,
    required this.idUser,
    required this.user,
    required this.division,
    required this.divisionCode,
    required this.date,
    required this.time,
    required this.title,
    required this.notes,
    required this.assetCode,
    required this.assetName,
    required this.partMesin,
    required this.woNumber,
    required this.maintenanceKind,
    required this.maintenanceActionLabel,
    required this.requestPartLabel,
    required this.executorCodeRaw,
    required this.mesoSubtype,
    required this.sourceTable,
    required this.mtcAreaKey,
    required this.media,
    required this.commentCount,
    required this.unreadCount,
    required this.tags,
    required this.followUps,
    required this.participantUserIds,
    required this.participantNames,
    required this.laborNames,
    required this.readerNames,
    required this.displayFullname,
  });

  int get photoCount => media.where((item) => item.mediaType == 'image').length;
  int get videoCount => media.where((item) => item.mediaType == 'video').length;

  List<DailyControlMedia> get imageMedia =>
      media.where((item) => item.mediaType == 'image').toList();

  String get assetLabel {
    final name = assetName.trim();
    if (name.isNotEmpty) return name;
    return assetCode.trim();
  }

  factory DailyControlActivity.fromJson(Map<String, dynamic> json) {
    final mediaRows = (json['media'] as List?) ?? const [];
    final tags = (json['tags'] as List?) ?? const [];
    final followups = (json['followups'] as List?) ?? const [];
    final participantIdRows =
        (json['participant_user_ids'] as List?) ?? const [];
    final participantNameRows =
        (json['participant_names'] as List?) ?? const [];
    final laborNameRows = (json['labor_names'] as List?) ?? const [];
    final readerNameRows = (json['reader_names'] as List?) ?? const [];
    final participantNames = participantNameRows
        .map((item) => '$item'.trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
    final laborNames = laborNameRows
        .map((item) => '$item'.trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
    String firstNonEmpty(List<dynamic> values) {
      for (final value in values) {
        final text = '${value ?? ''}'.trim();
        if (text.isNotEmpty) return text;
      }
      return '';
    }

    final fallbackUser = firstNonEmpty([
      json['user_alias'],
      json['display_name'],
      json['fullname'],
      json['created_by'],
    ]);
    final resolvedUser =
        fallbackUser.isNotEmpty ? fallbackUser : participantNames.join(', ');
    final parsedMedia = mediaRows
        .map(
          (item) => DailyControlMedia.fromJson(
            Map<String, dynamic>.from(item as Map),
          ),
        )
        .where((item) => item.mediaUrl.isNotEmpty)
        .toList();

    parsedMedia.sort((a, b) {
      if (a.id > 0 || b.id > 0) {
        return b.id.compareTo(a.id);
      }
      return 0;
    });

    return DailyControlActivity(
      id: int.tryParse('${json['id'] ?? 0}') ?? 0,
      idUser: int.tryParse('${json['id_user'] ?? 0}') ?? 0,
      user: resolvedUser,
      division: '${json['division_name'] ?? '-'}'.trim(),
      divisionCode: '${json['division_code'] ?? ''}'.trim(),
      date: '${json['activity_date'] ?? ''}',
      time: '${json['activity_time'] ?? ''}',
      title: '${json['title'] ?? ''}',
      notes: '${json['notes'] ?? ''}',
      assetCode: '${json['AssetCode'] ?? json['asset_code'] ?? ''}'.trim(),
      assetName: '${json['asset_name'] ?? json['AssetName'] ?? ''}'.trim(),
      partMesin: '${json['part_mesin'] ?? ''}'.trim(),
      woNumber: '${json['wo_number'] ?? ''}'.trim(),
      maintenanceKind: '${json['maintenance_kind'] ?? ''}'.trim(),
      maintenanceActionLabel:
          '${json['maintenance_action_label'] ?? ''}'.trim(),
      requestPartLabel: '${json['request_part_label'] ?? ''}'.trim(),
      executorCodeRaw: '${json['executor_code_raw'] ?? ''}'.trim(),
      mesoSubtype: '${json['meso_subtype'] ?? ''}'.trim(),
      sourceTable: '${json['source_table'] ?? ''}'.trim(),
      mtcAreaKey: '${json['mtc_area_key'] ?? ''}'.trim().toUpperCase(),
      media: parsedMedia,
      commentCount: int.tryParse('${json['comment_count'] ?? 0}') ?? 0,
      unreadCount: int.tryParse('${json['unread_count'] ?? 0}') ?? 0,
      tags: tags
          .map(
            (item) =>
                '@${(item as Map<String, dynamic>)['tag_fullname'] ?? ''}',
          )
          .where((item) => item != '@')
          .cast<String>()
          .toList(),
      followUps: followups
          .map(
            (item) =>
                DailyControlFollowUp.fromJson(item as Map<String, dynamic>),
          )
          .toList(),
      participantUserIds: participantIdRows
          .map((item) => int.tryParse('$item') ?? 0)
          .where((item) => item > 0)
          .toSet()
          .toList(),
      participantNames: participantNames,
      laborNames: laborNames,
      readerNames: readerNameRows
          .map((item) => '$item'.trim())
          .where((item) => item.isNotEmpty)
          .toSet()
          .toList(),
      displayFullname: '${json['display_fullname'] ?? ''}'.trim(),
    );
  }
}

class DailyControlUnreadActivity {
  final int id;
  final String activityDate;
  final String activityTime;
  final String displayName;
  final String divisionName;
  final String assetName;
  final String woNumber;
  final String title;
  final String notes;
  final int unreadCount;
  final String latestUnreadMessage;
  final String latestUnreadSender;
  final String latestUnreadAt;

  const DailyControlUnreadActivity({
    required this.id,
    required this.activityDate,
    required this.activityTime,
    required this.displayName,
    required this.divisionName,
    required this.assetName,
    required this.woNumber,
    required this.title,
    required this.notes,
    required this.unreadCount,
    required this.latestUnreadMessage,
    required this.latestUnreadSender,
    required this.latestUnreadAt,
  });

  factory DailyControlUnreadActivity.fromJson(Map<String, dynamic> json) {
    String firstNonEmpty(Iterable<Object?> values) {
      for (final value in values) {
        final text = '${value ?? ''}'.trim();
        if (text.isNotEmpty) {
          return text;
        }
      }
      return '';
    }

    final latestUnreadSender = firstNonEmpty([
      json['latest_unread_sender_alias'],
      json['latest_unread_alias'],
      json['latest_unread_user_alias'],
      json['last_sender_alias'],
      json['sender_alias'],
      json['latest_unread_sender'],
      json['latest_unread_fullname'],
    ]);
    return DailyControlUnreadActivity(
      id: int.tryParse('${json['id'] ?? 0}') ?? 0,
      activityDate: '${json['activity_date'] ?? ''}'.trim(),
      activityTime: '${json['activity_time'] ?? ''}'.trim(),
      // Untuk daftar unread, identitas yang relevan adalah pengirim pesan
      // terakhir—bukan pembuat aktivitas/WO seperti "WO MTC".
      displayName: firstNonEmpty([
        latestUnreadSender,
        json['display_name'],
        json['fullname'],
      ]),
      divisionName: '${json['division_name'] ?? ''}'.trim(),
      assetName: '${json['asset_name'] ?? ''}'.trim(),
      woNumber: '${json['wo_number'] ?? ''}'.trim(),
      title: '${json['title'] ?? ''}'.trim(),
      notes: '${json['notes'] ?? ''}'.trim(),
      unreadCount: int.tryParse('${json['unread_count'] ?? 0}') ?? 0,
      latestUnreadMessage: '${json['latest_unread_message'] ?? ''}'.trim(),
      latestUnreadSender: latestUnreadSender,
      latestUnreadAt: '${json['latest_unread_at'] ?? ''}'.trim(),
    );
  }
}

class DailyControlUserUpdateStatus {
  final DailyControlUser user;
  final int updateCount;

  const DailyControlUserUpdateStatus({
    required this.user,
    required this.updateCount,
  });
}

class DailyControlController extends GetxController
    with WidgetsBindingObserver {
  final DailyControlRepository _repository = DailyControlRepository();
  static const Duration _realtimeInterval = Duration(seconds: 8);

  final selectedDate = DateTime.now().obs;
  final activities = <DailyControlActivity>[].obs;
  final teamUsers = <DailyControlUser>[].obs;
  final selectedTags = <int>[].obs;
  final partOptions = <DailyControlLookupOption>[].obs;
  final selectedDivisionFilter = ''.obs;
  final selectedMesoFilter = 'ALL'.obs;
  final selectedMtcCategoryFilter = 'ALL'.obs;
  final selectedMtcAreaFilter = 'ALL'.obs;
  final selectedMaintenanceKindFilter = ''.obs;
  final selectedFeedUserId = RxnInt();
  final selectedFeedUserName = ''.obs;
  final availableDivisionFilters = <String>[].obs;
  final availableMtcCategoryFilters = <String>[].obs;
  final availableMtcAreaFilters = <String>[].obs;
  final draftMedia = <DailyControlDraftMedia>[].obs;

  final selectedAsset = Rxn<DailyControlLookupOption>();
  final selectedPart = Rxn<DailyControlLookupOption>();
  final selectedWo = Rxn<DailyControlLookupOption>();

  final isLoading = false.obs;
  final isSaving = false.obs;
  final isPartLoading = false.obs;
  final isPickingMedia = false.obs;
  final isLoadingSummary = false.obs;
  final hasLoadedInitialData = false.obs;
  final isLoadingUnreadActivities = false.obs;
  final pendingOpenActivityId = RxnInt();
  final pendingOpenUnreadList = false.obs;
  final hasRetriedPendingNotificationOpen = false.obs;
  Map<String, dynamic>? pendingNotificationPayload;
  Timer? _realtimeTimer;
  StreamSubscription<Map<String, dynamic>>? _notificationSubscription;
  final scheduledPreventiveTotal = 0.obs;
  final unreadActivities = <DailyControlUnreadActivity>[].obs;
  final unreadActivityCount = 0.obs;

  final activityController = TextEditingController();
  final titleController = TextEditingController();

  String _userDivisionCode = '';
  bool _hasDailyControlAll = false;
  bool _hasLoadedUnreadActivityCount = false;
  final Map<String, int> _userMtcAreaPermissions = {
    'GSU_WNB': 0,
    'GSU_INJECT': 0,
    'RU_SAWMILL': 0,
    'RU_PRODUCTION': 0,
  };
  final Map<String, int> _userMtcCategoryPermissions = {
    'GENERAL': 0,
    'ELECTRICAL': 0,
    'MOULD': 0,
  };

  @override
  void onInit() {
    super.onInit();
    WidgetsBinding.instance.addObserver(this);
    availableDivisionFilters.assignAll(const ['MTC', 'MESO', 'ITS']);
    availableMtcCategoryFilters.assignAll(const ['ALL']);
    availableMtcAreaFilters.assignAll(const ['ALL']);
    unawaited(_restoreUnreadActivityCount());
    _bootstrap();
  }

  Future<void> _restoreUnreadActivityCount() async {
    final storedCount =
        await PushNotificationService.instance.getDailyControlBadgeCount();
    if (!_hasLoadedUnreadActivityCount && storedCount >= 0) {
      unreadActivityCount.value = storedCount;
    }
  }

  Future<void> _bootstrap() async {
    _hydrateInitialNotificationTarget();
    _listenNotificationEvents();
    await _loadUserScopeFromPrefs();
    await loadData();
    _startRealtimeUpdates();
  }

  void _listenNotificationEvents() {
    _notificationSubscription?.cancel();
    _notificationSubscription =
        PushNotificationService.instance.messageStream.listen((payload) async {
      final type = payload['type']?.toString().trim().toLowerCase() ?? '';
      if (type != 'daily_control_comment') {
        return;
      }
      await loadUnreadActivities(showLoader: false);
      if (isLoading.value || isSaving.value) {
        return;
      }

      final payloadDate =
          _parseActivityDate(payload['activity_date']?.toString());
      if (payloadDate != null &&
          !_isSameDate(payloadDate, selectedDate.value)) {
        return;
      }

      await loadData(showLoader: false, showError: false);
    });
  }

  void _startRealtimeUpdates() {
    _realtimeTimer?.cancel();
    _realtimeTimer = Timer.periodic(_realtimeInterval, (_) async {
      if (!Get.isRegistered<DailyControlController>()) {
        return;
      }
      if (isLoading.value || isSaving.value) {
        return;
      }
      await loadData(showLoader: false, showError: false);
    });
  }

  void _hydrateInitialNotificationTarget() {
    final args = Get.arguments;
    if (args is Map) {
      final payload = Map<String, dynamic>.from(args);
      if (payload['open_unread_list'] == true) {
        pendingOpenUnreadList.value = true;
        return;
      }
      pendingNotificationPayload = payload;
      applyNotificationTarget(
        dailyControlId:
            int.tryParse('${payload['daily_control_id'] ?? 0}') ?? 0,
        activityDate: payload['activity_date']?.toString(),
        payload: payload,
        shouldReload: false,
      );
    }
  }

  @override
  void onClose() {
    _notificationSubscription?.cancel();
    _realtimeTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    activityController.dispose();
    titleController.dispose();
    super.onClose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        !isLoading.value &&
        !isSaving.value) {
      loadData(showLoader: false, showError: false);
    }
  }

  String get selectedDateLabel => formatDisplayDateValue(selectedDate.value);

  String get selectedDateKey =>
      DateFormat('yyyy-MM-dd').format(selectedDate.value);

  bool get isToday {
    final now = DateTime.now();
    final selected = selectedDate.value;
    return selected.year == now.year &&
        selected.month == now.month &&
        selected.day == now.day;
  }

  Future<void> _loadUserScopeFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _userDivisionCode =
          (prefs.getString('division_code') ?? '').trim().toUpperCase();
      _hasDailyControlAll = (prefs.getInt('daily_control_all') ?? 0) == 1;

      _userMtcAreaPermissions['GSU_WNB'] =
          (prefs.getInt('mtc_area_gsu_wnb') ?? 0);
      _userMtcAreaPermissions['GSU_INJECT'] =
          (prefs.getInt('mtc_area_gsu_inject') ?? 0);
      _userMtcAreaPermissions['RU_SAWMILL'] =
          (prefs.getInt('mtc_area_ru_sawmill') ?? 0);
      _userMtcAreaPermissions['RU_PRODUCTION'] =
          (prefs.getInt('mtc_area_ru_production') ?? 0);

      _userMtcCategoryPermissions['GENERAL'] =
          (prefs.getInt('wo_category_general') ?? 0);
      _userMtcCategoryPermissions['ELECTRICAL'] =
          (prefs.getInt('wo_category_electrical') ?? 0);
      _userMtcCategoryPermissions['MOULD'] =
          (prefs.getInt('wo_category_mould') ?? 0);

      final hasAnyCategory =
          _userMtcCategoryPermissions.values.any((value) => value == 1);
      if (hasAnyCategory) {
        final categoryFilters = <String>['ALL'];
        _userMtcCategoryPermissions.forEach((key, value) {
          if (value == 1) {
            categoryFilters.add(key);
          }
        });
        availableMtcCategoryFilters.assignAll(categoryFilters);
      } else {
        availableMtcCategoryFilters.assignAll(const [
          'ALL',
          'GENERAL',
          'ELECTRICAL',
          'MOULD',
        ]);
      }

      final hasAnyArea =
          _userMtcAreaPermissions.values.any((value) => value == 1);
      if (hasAnyArea) {
        final areaFilters = <String>['ALL'];
        _userMtcAreaPermissions.forEach((key, value) {
          if (value == 1) {
            areaFilters.add(key);
          }
        });
        availableMtcAreaFilters.assignAll(areaFilters);
      } else {
        availableMtcAreaFilters.assignAll(const [
          'ALL',
          'GSU_WNB',
          'GSU_INJECT',
          'RU_SAWMILL',
          'RU_PRODUCTION',
        ]);
      }
    } catch (_) {
      availableMtcCategoryFilters.assignAll(const ['ALL']);
      availableMtcAreaFilters.assignAll(const ['ALL']);
    }
  }

  String mtcCategoryLabel(String key) {
    switch (key.toUpperCase()) {
      case 'GENERAL':
        return 'General';
      case 'ELECTRICAL':
        return 'Elektrikal';
      case 'MOULD':
        return 'Mould';
      default:
        return 'Semua Kategori';
    }
  }

  String mtcAreaLabel(String key) {
    switch (key.toUpperCase()) {
      case 'GSU_WNB':
        return 'GSU - WNB';
      case 'GSU_INJECT':
        return 'GSU - Inject';
      case 'RU_SAWMILL':
        return 'RU - Sawmill';
      case 'RU_PRODUCTION':
        return 'RU - FJLB';
      default:
        return 'Semua Lokasi';
    }
  }

  List<DailyControlActivity> get _baseFilteredActivities {
    final divisionFilter = selectedDivisionFilter.value.toUpperCase();
    final mesoFilter = selectedMesoFilter.value.toUpperCase();
    final mtcCategoryFilter = selectedMtcCategoryFilter.value.toUpperCase();
    final mtcAreaFilter = selectedMtcAreaFilter.value.toUpperCase();

    return activities.where((activity) {
      if (divisionFilter == 'MTC') {
        if (!_isMtcActivity(activity)) {
          return false;
        }
        if (mtcCategoryFilter != 'ALL' &&
            !_isMtcCategoryActivity(activity, mtcCategoryFilter)) {
          return false;
        }
        if (mtcAreaFilter == 'ALL') {
          return true;
        }
        return _isMtcAreaActivity(activity, mtcAreaFilter);
      }
      if (divisionFilter == 'ITS') {
        return _isItsActivity(activity);
      }
      if (divisionFilter == 'MESO') {
        if (!_isMesoActivity(activity)) {
          return false;
        }
        if (mesoFilter == 'ALL') {
          return true;
        }
        return _isMesoSubCategory(activity, mesoFilter);
      }
      return divisionFilter == 'MY';
    }).toList();
  }

  List<DailyControlActivity> get filteredActivities {
    final filtered = _baseFilteredActivities
        .where(_matchesSelectedFeedUser)
        .where(_matchesSelectedMaintenanceKind)
        .toList();

    filtered.sort((a, b) {
      final unreadA = a.unreadCount > 0 ? 1 : 0;
      final unreadB = b.unreadCount > 0 ? 1 : 0;
      final unreadCompare = unreadB.compareTo(unreadA);
      if (unreadCompare != 0) {
        return unreadCompare;
      }

      final nameCompare = a.user.toLowerCase().compareTo(b.user.toLowerCase());
      if (nameCompare != 0) {
        return nameCompare;
      }
      final timeA = a.time;
      final timeB = b.time;
      return timeB.compareTo(timeA);
    });

    return filtered;
  }

  List<DailyControlActivity> get _summaryActivities =>
      _baseFilteredActivities.where(_matchesSelectedFeedUser).toList();

  int get correctiveDoneCount => _summaryActivities
      .where((activity) =>
          activity.maintenanceKind.trim().toLowerCase() == 'corrective')
      .length;

  int get projectDoneCount => _summaryActivities
      .where((activity) =>
          activity.maintenanceKind.trim().toLowerCase() == 'project')
      .length;

  int get preventiveDoneCount => _summaryActivities
      .where((activity) =>
          activity.maintenanceKind.trim().toLowerCase() == 'preventive')
      .length;

  int get totalDoneCount => filteredActivities.length;

  List<DailyControlUser> get filteredTeamUsers {
    final divisionFilter = selectedDivisionFilter.value.toUpperCase();
    final mesoFilter = selectedMesoFilter.value.toUpperCase();
    final mtcCategoryFilter = selectedMtcCategoryFilter.value.toUpperCase();
    final mtcAreaFilter = selectedMtcAreaFilter.value.toUpperCase();

    final users = teamUsers.where((user) {
      if (divisionFilter == 'MTC') {
        if (!_isMtcUser(user)) {
          return false;
        }
        if (mtcCategoryFilter != 'ALL' &&
            !user.hasMtcCategory(mtcCategoryFilter)) {
          return false;
        }
        if (mtcAreaFilter == 'ALL') {
          return true;
        }
        return user.hasMtcArea(mtcAreaFilter);
      }
      if (divisionFilter == 'ITS') {
        return _isItsUser(user);
      }
      if (divisionFilter == 'MESO') {
        if (!_isMesoUser(user)) {
          return false;
        }
        if (mesoFilter == 'ALL') {
          return true;
        }
        return _isMesoUserSubCategory(user, mesoFilter);
      }
      return divisionFilter == 'MY';
    }).toList();

    users.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return users;
  }

  List<DailyControlUser> get filteredExecutorAdminTeamUsers {
    if (selectedDivisionFilter.value == 'ITS') {
      return filteredTeamUsers;
    }
    return filteredTeamUsers.where((user) => user.isExecutorAdmin).toList();
  }

  Set<int> get postedUserIds {
    final ids = <int>{};
    for (final activity in activities) {
      ids.addAll(activity.participantUserIds.where((id) => id > 0));
      if (activity.idUser > 0) {
        ids.add(activity.idUser);
      }
    }
    return ids;
  }

  Set<String> get postedUserNames {
    final names = <String>{};
    for (final activity in activities) {
      names.addAll(
        activity.participantNames
            .map((name) => name.trim().toUpperCase())
            .where((name) => name.isNotEmpty),
      );
      final activityUser = activity.user.trim().toUpperCase();
      if (activityUser.isNotEmpty) {
        names.add(activityUser);
      }
    }
    return names;
  }

  List<DailyControlUser> get postedUsers {
    final posted = postedUserIds;
    final postedNames = postedUserNames;
    return filteredTeamUsers
        .where(
          (user) =>
              posted.contains(user.idUser) ||
              postedNames.contains(user.name.trim().toUpperCase()),
        )
        .toList();
  }

  List<DailyControlUser> get usersNotPosted {
    final posted = postedUserIds;
    final postedNames = postedUserNames;
    return filteredTeamUsers
        .where(
          (user) =>
              user.idUser > 0 &&
              !posted.contains(user.idUser) &&
              !postedNames.contains(user.name.trim().toUpperCase()),
        )
        .toList();
  }

  List<DailyControlUserUpdateStatus> get userUpdateStatuses {
    final countableActivities =
        _baseFilteredActivities.where(_matchesSelectedMaintenanceKind).toList();
    final statuses = filteredExecutorAdminTeamUsers.map((user) {
      final candidateNames = <String>{
        user.name.trim().toUpperCase(),
        user.fullname.trim().toUpperCase(),
        user.alias.trim().toUpperCase(),
      }..remove('');

      var count = 0;
      for (final activity in countableActivities) {
        final matchesId = user.idUser > 0 &&
            (activity.participantUserIds.contains(user.idUser) ||
                activity.idUser == user.idUser);

        final activityNames = <String>{
          activity.user.trim().toUpperCase(),
          ...activity.participantNames.map(
            (name) => name.trim().toUpperCase(),
          ),
        }..remove('');
        final matchesName = activityNames.any(candidateNames.contains);

        // A participant can be represented by id, alias, or a legacy fullname.
        // Count the activity once even when more than one representation matches.
        if (matchesId || matchesName) {
          count++;
        }
      }

      return DailyControlUserUpdateStatus(user: user, updateCount: count);
    }).toList();

    statuses.sort((a, b) {
      final countCompare = b.updateCount.compareTo(a.updateCount);
      if (countCompare != 0) {
        return countCompare;
      }
      return a.user.name.toLowerCase().compareTo(b.user.name.toLowerCase());
    });

    return statuses;
  }

  String get summaryDivisionLabel {
    return selectedDivisionFilter.value == 'ITS'
        ? 'IS'
        : selectedDivisionFilter.value;
  }

  bool get showMtcAreaFilter {
    return selectedDivisionFilter.value == 'MTC' &&
        availableMtcAreaFilters.isNotEmpty;
  }

  bool get showMtcCategoryFilter {
    return selectedDivisionFilter.value == 'MTC' &&
        availableMtcCategoryFilters.isNotEmpty;
  }

  bool get hasSelectedFeedUserFilter =>
      selectedFeedUserName.value.trim().isNotEmpty;

  String get selectedFeedUserFilterName => selectedFeedUserName.value.trim();

  bool isFeedUserSelected(DailyControlUser user) {
    final selectedName = selectedFeedUserName.value.trim().toUpperCase();
    if (selectedName.isEmpty) {
      return false;
    }
    if (selectedFeedUserId.value != null &&
        selectedFeedUserId.value! > 0 &&
        user.idUser > 0) {
      return selectedFeedUserId.value == user.idUser;
    }
    return user.name.trim().toUpperCase() == selectedName;
  }

  void toggleFeedUserFilter(DailyControlUser user) {
    if (isFeedUserSelected(user)) {
      clearFeedUserFilter();
      return;
    }

    selectedFeedUserId.value = user.idUser > 0 ? user.idUser : null;
    selectedFeedUserName.value = user.name.trim();
  }

  void clearFeedUserFilter() {
    selectedFeedUserId.value = null;
    selectedFeedUserName.value = '';
  }

  void setDivisionFilter(String key) {
    final filter = key.trim().toUpperCase();
    final candidate = filter;
    if (availableDivisionFilters.isNotEmpty &&
        !availableDivisionFilters.contains(candidate)) {
      return;
    }

    selectedDivisionFilter.value = candidate;
    if (selectedDivisionFilter.value != 'MESO') {
      selectedMesoFilter.value = 'ALL';
    }
    if (selectedDivisionFilter.value != 'MTC') {
      selectedMtcCategoryFilter.value = 'ALL';
      selectedMtcAreaFilter.value = 'ALL';
    }
    _ensureSelectedFeedUserStillVisible();
    _refreshScheduledPreventiveTotal();
  }

  void setMesoFilter(String key) {
    selectedDivisionFilter.value = 'MESO';
    final filter = key.trim().toUpperCase();
    selectedMesoFilter.value = filter.isEmpty ? 'ALL' : filter;
    _ensureSelectedFeedUserStillVisible();
    _refreshScheduledPreventiveTotal();
  }

  void setMtcAreaFilter(String key) {
    final filter = key.trim().toUpperCase();
    final candidate = filter;
    if (availableMtcAreaFilters.isNotEmpty &&
        !availableMtcAreaFilters.contains(candidate)) {
      return;
    }
    selectedDivisionFilter.value = 'MTC';
    selectedMtcAreaFilter.value = candidate;
    _ensureSelectedFeedUserStillVisible();
    _refreshScheduledPreventiveTotal();
  }

  void setMtcCategoryFilter(String key) {
    final filter = key.trim().toUpperCase();
    final candidate = filter;
    if (availableMtcCategoryFilters.isNotEmpty &&
        !availableMtcCategoryFilters.contains(candidate)) {
      return;
    }
    selectedDivisionFilter.value = 'MTC';
    selectedMtcCategoryFilter.value = candidate;
    _ensureSelectedFeedUserStillVisible();
    _refreshScheduledPreventiveTotal();
  }

  Future<void> _refreshScheduledPreventiveTotal() async {
    final divisionFilter = selectedDivisionFilter.value.trim().toUpperCase();
    if (divisionFilter.isEmpty) {
      scheduledPreventiveTotal.value = 0;
      return;
    }

    try {
      isLoadingSummary.value = true;
      final result = await _repository.getScheduledSummary(
        date: selectedDateKey,
        division: divisionFilter,
        mesoFilter: selectedMesoFilter.value,
        mtcCategory: selectedMtcCategoryFilter.value,
        mtcArea: selectedMtcAreaFilter.value,
      );

      if (result['status'] == true && result['data'] is Map) {
        final data = Map<String, dynamic>.from(result['data'] as Map);
        scheduledPreventiveTotal.value =
            int.tryParse('${data['preventive_total'] ?? 0}') ?? 0;
      } else {
        scheduledPreventiveTotal.value = 0;
      }
    } catch (_) {
      scheduledPreventiveTotal.value = 0;
    } finally {
      isLoadingSummary.value = false;
    }
  }

  bool _matchesSelectedFeedUser(DailyControlActivity activity) {
    final selectedName = selectedFeedUserName.value.trim().toUpperCase();
    if (selectedName.isEmpty) {
      return true;
    }

    final selectedId = selectedFeedUserId.value;
    final selectedNames = <String>{selectedName};
    if (selectedId != null && selectedId > 0) {
      if (activity.participantUserIds.contains(selectedId) ||
          activity.idUser == selectedId) {
        return true;
      }

      for (final user in teamUsers) {
        if (user.idUser != selectedId) continue;
        selectedNames.addAll({
          user.alias.trim().toUpperCase(),
          user.name.trim().toUpperCase(),
          user.fullname.trim().toUpperCase(),
        });
        break;
      }
    }
    selectedNames.remove('');

    final participantNames = activity.participantNames
        .map((name) => name.trim().toUpperCase())
        .where((name) => name.isNotEmpty);
    if (participantNames.any(selectedNames.contains)) {
      return true;
    }

    return selectedNames.contains(activity.user.trim().toUpperCase());
  }

  String resolveActivityDisplayName(DailyControlActivity activity) {
    if (activity.displayFullname.isNotEmpty) {
      return activity.displayFullname;
    }
    final normalizedNames = <String>{};

    DailyControlUser? findUser({int? id, String? name}) {
      final normalizedName = (name ?? '').trim().toUpperCase();
      for (final user in teamUsers) {
        if (id != null && id > 0 && user.idUser == id) {
          return user;
        }
        if (normalizedName.isNotEmpty &&
            <String>{
              user.alias.trim().toUpperCase(),
              user.name.trim().toUpperCase(),
              user.fullname.trim().toUpperCase(),
            }.contains(normalizedName)) {
          return user;
        }
      }
      return null;
    }

    // Kumpulkan PIC/Labor names (dari tb_detail_labor saja)
    final laborDisplayNames = <String>[];

    for (final laborName in activity.laborNames) {
      final user = findUser(name: laborName);
      final name = (user?.preferredDisplayName ?? laborName).trim();
      final normalized = name.toUpperCase();
      if (name.isNotEmpty && !normalizedNames.contains(normalized)) {
        normalizedNames.add(normalized);
        laborDisplayNames.add(name);
      }
    }

    // Updater (orang yang update WO)
    final updaterUser = findUser(
      id: activity.idUser,
      name: activity.user,
    );
    final updaterName =
        (updaterUser?.preferredDisplayName ?? activity.user).trim();

    // Hanya tampilkan nama PIC/Labor, tanpa suffix updater.
    if (laborDisplayNames.isNotEmpty) {
      return laborDisplayNames.join(', ');
    }

    // Tidak ada PIC/Labor → cek participantNames sebagai fallback
    for (final participantName in activity.participantNames) {
      final user = findUser(name: participantName);
      final name = (user?.preferredDisplayName ?? participantName).trim();
      final normalized = name.toUpperCase();
      if (name.isNotEmpty && !normalizedNames.contains(normalized)) {
        normalizedNames.add(normalized);
        laborDisplayNames.add(name);
      }
    }

    if (laborDisplayNames.isNotEmpty) {
      return laborDisplayNames.join(', ');
    }

    // Tidak ada PIC/Labor sama sekali → tampilkan updater saja
    return updaterName.isNotEmpty ? updaterName : activity.user;
  }

  void _ensureSelectedFeedUserStillVisible() {
    final selectedName = selectedFeedUserName.value.trim().toUpperCase();
    if (selectedName.isEmpty) {
      return;
    }

    final selectedId = selectedFeedUserId.value;
    final stillExists = filteredExecutorAdminTeamUsers.any((user) {
      if (selectedId != null && selectedId > 0 && user.idUser > 0) {
        return user.idUser == selectedId;
      }
      return user.name.trim().toUpperCase() == selectedName;
    });

    if (!stillExists) {
      clearFeedUserFilter();
    }
  }

  bool _isMtcActivity(DailyControlActivity activity) {
    final code = activity.divisionCode.toUpperCase();
    final name = activity.division.toUpperCase();
    if (code.contains('MTC')) {
      return true;
    }
    return name.contains('MAINTENANCE') && !name.contains('MESO');
  }

  bool _isMtcUser(DailyControlUser user) {
    final code = user.divisionCode.toUpperCase();
    final name = user.role.toUpperCase();
    if (code.contains('MTC')) {
      return true;
    }
    return name.contains('MAINTENANCE') && !name.contains('MESO');
  }

  bool _isItsActivity(DailyControlActivity activity) {
    final code = activity.divisionCode.toUpperCase();
    final name = activity.division.toUpperCase();
    return code.contains('ITS') ||
        code.contains('ITIS') ||
        name.contains('IT INFORMATION SYSTEM') ||
        name == 'IT';
  }

  bool _isItsUser(DailyControlUser user) {
    final code = user.divisionCode.toUpperCase();
    final name = user.role.toUpperCase();
    return code.contains('ITS') ||
        code.contains('ITIS') ||
        name.contains('IT INFORMATION SYSTEM') ||
        name == 'IT';
  }

  bool _isMesoActivity(DailyControlActivity activity) {
    final code = activity.divisionCode.toUpperCase();
    final name = activity.division.toUpperCase();
    final haystack = _activityHaystack(activity);
    if (_detectMesoSubCategory(
          code: code,
          name: name,
          haystack: haystack,
          executorCode: activity.executorCodeRaw,
          mesoSubtype: activity.mesoSubtype,
        ) !=
        '') {
      return true;
    }
    if (name.contains('MESO')) {
      return true;
    }

    const mesoCodes = ['MES', 'MESO', 'MKL', 'ELC', 'SPL', 'OTO'];
    for (final mesoCode in mesoCodes) {
      if (code.contains(mesoCode)) {
        return true;
      }
    }

    return name.contains('MEKANIKAL') ||
        name.contains('ELEKTRIKAL') ||
        name.contains('SIPIL') ||
        name.contains('OTOMOTIF');
  }

  bool _isMesoUser(DailyControlUser user) {
    final code = user.divisionCode.toUpperCase();
    final name = user.role.toUpperCase();
    if (name.contains('MESO')) {
      return true;
    }
    const mesoCodes = ['MES', 'MESO', 'MKL', 'ELC', 'SPL', 'OTO'];
    for (final mesoCode in mesoCodes) {
      if (code.contains(mesoCode)) {
        return true;
      }
    }
    return name.contains('MEKANIKAL') ||
        name.contains('ELEKTRIKAL') ||
        name.contains('SIPIL') ||
        name.contains('OTOMOTIF');
  }

  bool _isMesoSubCategory(DailyControlActivity activity, String key) {
    final detected = _detectMesoSubCategory(
      code: activity.divisionCode.toUpperCase(),
      name: activity.division.toUpperCase(),
      haystack: _activityHaystack(activity),
      executorCode: activity.executorCodeRaw,
      mesoSubtype: activity.mesoSubtype,
    );
    return key == 'ALL' ? true : detected == key;
  }

  bool _isMesoUserSubCategory(DailyControlUser user, String key) {
    final code = user.divisionCode.toUpperCase();
    final name = user.role.toUpperCase();

    if (key == 'MKL') {
      return code.contains('MKL') || name.contains('MEKANIKAL');
    }
    if (key == 'ELC') {
      return code.contains('ELC') || name.contains('ELEKTRIKAL');
    }
    if (key == 'SPL') {
      return code.contains('SPL') || name.contains('SIPIL');
    }
    if (key == 'OTO') {
      return code.contains('OTO') || name.contains('OTOMOTIF');
    }
    return true;
  }

  bool _isMtcAreaActivity(DailyControlActivity activity, String areaKey) {
    final normalizedAreaKey = areaKey.trim().toUpperCase();
    if (normalizedAreaKey.isEmpty) {
      return true;
    }

    if (activity.mtcAreaKey.isNotEmpty) {
      return activity.mtcAreaKey == normalizedAreaKey;
    }

    final haystack = [
      activity.assetCode,
      activity.assetName,
      activity.woNumber,
      activity.title,
      activity.notes,
      activity.divisionCode,
      activity.division,
    ].join(' ').toUpperCase();

    switch (normalizedAreaKey) {
      case 'GSU_WNB':
        return haystack.contains('WNB');
      case 'GSU_INJECT':
        return haystack.contains('INJECT');
      case 'RU_SAWMILL':
        return haystack.contains('SAWMILL');
      case 'RU_PRODUCTION':
        return haystack.contains('PRODUCTION');
      default:
        return true;
    }
  }

  bool _isMtcCategoryActivity(
    DailyControlActivity activity,
    String categoryKey,
  ) {
    final owner = teamUsers
        .where((user) => user.idUser == activity.idUser)
        .cast<DailyControlUser?>()
        .firstWhere((user) => user != null, orElse: () => null);

    if (owner != null && owner.hasAnyMtcCategory) {
      return owner.hasMtcCategory(categoryKey);
    }

    final haystack = _activityHaystack(activity);
    switch (categoryKey.toUpperCase()) {
      case 'GENERAL':
        return _containsAnyWord(haystack, const [
          'GENERAL',
          'MEKANIK',
          'MECHANICAL',
        ]);
      case 'ELECTRICAL':
        return _containsAnyWord(haystack, const [
          'ELEKTRIK',
          'ELECTRICAL',
          'ELECTRIC',
          'ELC',
        ]);
      case 'MOULD':
        return _containsAnyWord(haystack, const ['MOULD', 'MOLD']);
      default:
        return true;
    }
  }

  String _activityHaystack(DailyControlActivity activity) {
    return _normalizeHaystack([
      activity.assetCode,
      activity.assetName,
      activity.woNumber,
      activity.title,
      activity.notes,
      activity.partMesin,
      activity.divisionCode,
      activity.division,
      activity.executorCodeRaw,
      activity.mesoSubtype,
    ].join(' '));
  }

  String _normalizeHaystack(String text) {
    return (' ${text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]+'), ' ')} ')
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  bool _containsAnyWord(String text, List<String> words) {
    final normalized = _normalizeHaystack(text);
    for (final word in words) {
      if (normalized.contains(' ${word.toUpperCase()} ')) {
        return true;
      }
    }
    return false;
  }

  bool _matchesSelectedMaintenanceKind(DailyControlActivity activity) {
    final filter = selectedMaintenanceKindFilter.value.trim().toLowerCase();
    if (filter.isEmpty) {
      return true;
    }

    return activity.maintenanceKind.trim().toLowerCase() == filter;
  }

  bool isMaintenanceKindSelected(String kind) {
    return selectedMaintenanceKindFilter.value.trim().toLowerCase() ==
        kind.trim().toLowerCase();
  }

  void toggleMaintenanceKindFilter(String kind) {
    final normalized = kind.trim().toLowerCase();
    if (normalized.isEmpty) {
      selectedMaintenanceKindFilter.value = '';
      return;
    }

    selectedMaintenanceKindFilter.value =
        isMaintenanceKindSelected(normalized) ? '' : normalized;
  }

  String _detectMesoSubCategory({
    required String code,
    required String name,
    required String haystack,
    required String executorCode,
    required String mesoSubtype,
  }) {
    final divisionScope = '$code $name';
    if (_containsAnyWord(divisionScope, const [
      'OTO',
      'OTOMOTIF',
      'AUTOMOTIVE',
    ])) {
      return 'OTO';
    }
    if (_containsAnyWord(divisionScope, const [
      'SPL',
      'SIPIL',
      'CIVIL',
    ])) {
      return 'SPL';
    }
    if (_containsAnyWord(divisionScope, const [
      'ELC',
      'ELEKTRIKAL',
      'ELECTRICAL',
      'ELEKTRIK',
      'ELECTR',
    ])) {
      return 'ELC';
    }
    if (_containsAnyWord(divisionScope, const [
      'MKL',
      'MEC',
      'MEKANIKAL',
      'MECHANICAL',
    ])) {
      return 'MKL';
    }

    final subtype = mesoSubtype.trim().toUpperCase();
    if (const {'MKL', 'ELC', 'SPL', 'OTO'}.contains(subtype)) {
      return subtype;
    }

    final executor = executorCode.trim().toUpperCase();
    if (executor.contains('MKL') ||
        executor.contains('MEC') ||
        executor.contains('MEKANIK')) {
      return 'MKL';
    }
    if (executor.contains('ELC') ||
        executor.contains('ELEKTR') ||
        executor.contains('ELECTR')) {
      return 'ELC';
    }
    if (executor.contains('SPL') ||
        executor.contains('SIPIL') ||
        executor.contains('CIVIL')) {
      return 'SPL';
    }
    if (executor.contains('OTO') ||
        executor.contains('OTOMOT') ||
        executor.contains('AUTOMOT')) {
      return 'OTO';
    }

    if (_containsAnyWord('$code $name $haystack', const [
      'MKL',
      'MEC',
      'MEKANIKAL',
      'MECHANICAL',
    ])) {
      return 'MKL';
    }
    if (_containsAnyWord('$code $name $haystack', const [
      'ELC',
      'ELEKTRIKAL',
      'ELECTRICAL',
      'ELEKTRIK',
      'ELECTR',
    ])) {
      return 'ELC';
    }
    if (_containsAnyWord('$code $name $haystack', const [
      'SPL',
      'SIPIL',
      'CIVIL',
    ])) {
      return 'SPL';
    }
    if (_containsAnyWord('$code $name $haystack', const [
      'OTO',
      'OTOMOTIF',
      'AUTOMOTIVE',
    ])) {
      return 'OTO';
    }

    return '';
  }

  Future<void> loadData({
    bool showLoader = true,
    bool showError = true,
  }) async {
    try {
      if (showLoader) {
        isLoading.value = true;
      }
      final response = await _repository.getDailyControlList(
        date: selectedDateKey,
      );

      if (response['status'] == true && response['data'] is Map) {
        final data = response['data'] as Map<String, dynamic>;
        _applyScopeFromApi(data['scope']);

        final users = (data['users'] as List?) ?? const [];
        final parsedUsers = users
            .map(
              (item) => DailyControlUser.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList()
          ..sort(
              (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        teamUsers.assignAll(parsedUsers);

        final activityRows = (data['activities'] as List?) ?? const [];
        final parsedActivities = activityRows
            .map(
              (item) => DailyControlActivity.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList();
        activities.assignAll(parsedActivities);
        _ensureSelectedFeedUserStillVisible();
        await Future.wait([
          _refreshScheduledPreventiveTotal(),
          _syncBadgeCountFromActivities(),
          loadUnreadActivities(showLoader: false),
        ]);
      } else {
        activities.clear();
        clearFeedUserFilter();
        scheduledPreventiveTotal.value = 0;
        availableDivisionFilters.assignAll(const ['MTC', 'MESO', 'ITS']);
        // Jangan clear unreadActivities atau reset badge
        // karena mungkin ada unread di tanggal lain
      }
    } catch (e) {
      if (showError) {
        activities.clear();
        clearFeedUserFilter();
        scheduledPreventiveTotal.value = 0;
        availableDivisionFilters.assignAll(const ['MTC', 'MESO', 'ITS']);
        // Jangan clear unreadActivities - biarkan badge tetap tampil
        Get.snackbar(
          'Daily Control',
          'Gagal memuat data: $e',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFdc2626),
          colorText: Colors.white,
        );
      }
    } finally {
      if (showLoader) {
        isLoading.value = false;
      }
      hasLoadedInitialData.value = true;
    }
  }

  void _applyScopeFromApi(dynamic scopeRaw) {
    final scope = scopeRaw is Map ? Map<String, dynamic>.from(scopeRaw) : {};
    final type = '${scope['type'] ?? 'ALL'}'.trim().toUpperCase();

    switch (type) {
      case 'ALL':
        availableDivisionFilters.assignAll(const ['MTC', 'MESO', 'ITS']);
        break;
      case 'MTC':
        availableDivisionFilters.assignAll(const ['MTC']);
        break;
      case 'ITS':
        availableDivisionFilters.assignAll(const ['ITS']);
        break;
      case 'MESO':
        availableDivisionFilters.assignAll(const ['MESO']);
        break;
      case 'NONE':
        availableDivisionFilters.clear();
        break;
      default:
        availableDivisionFilters.assignAll(const ['MY']);
        break;
    }

    if (!_hasDailyControlAll && availableDivisionFilters.isNotEmpty) {
      final forced = _guessDivisionFilterByUser();
      if (forced != null && availableDivisionFilters.contains(forced)) {
        availableDivisionFilters.assignAll([forced]);
      } else if (availableDivisionFilters.contains('MY')) {
        availableDivisionFilters.assignAll(const ['MY']);
      } else if (availableDivisionFilters.length > 1 &&
          availableDivisionFilters.contains('ALL')) {
        final withoutAll =
            availableDivisionFilters.where((item) => item != 'ALL').toList();
        if (withoutAll.isNotEmpty) {
          availableDivisionFilters.assignAll([withoutAll.first]);
        }
      }
    }

    if (availableDivisionFilters.isEmpty) {
      selectedDivisionFilter.value = '';
      selectedMesoFilter.value = 'ALL';
      selectedMtcAreaFilter.value = 'ALL';
      clearFeedUserFilter();
      return;
    }

    if (!availableDivisionFilters.contains(selectedDivisionFilter.value)) {
      selectedDivisionFilter.value = availableDivisionFilters.length == 1
          ? availableDivisionFilters.first
          : '';
    }
    if (selectedDivisionFilter.value != 'MESO') {
      selectedMesoFilter.value = 'ALL';
    }
    if (selectedDivisionFilter.value != 'MTC') {
      selectedMtcAreaFilter.value = 'ALL';
    }
    _ensureSelectedFeedUserStillVisible();
  }

  String? _guessDivisionFilterByUser() {
    final code = _userDivisionCode.toUpperCase();
    if (code.contains('ITS') || code.contains('ITIS')) {
      return 'ITS';
    }
    if (code.contains('MTC')) {
      return 'MTC';
    }
    if (code.contains('MESO') ||
        code.contains('MES') ||
        code.contains('MKL') ||
        code.contains('ELC') ||
        code.contains('SPL') ||
        code.contains('OTO')) {
      return 'MESO';
    }
    return null;
  }

  Future<void> previousDate() async {
    selectedDate.value = selectedDate.value.subtract(const Duration(days: 1));
    await loadData();
  }

  Future<void> nextDate() async {
    if (isToday) {
      return;
    }
    selectedDate.value = selectedDate.value.add(const Duration(days: 1));
    await loadData();
  }

  Future<void> pickDate() async {
    final pickedDate = await AppDatePickerHelper.pickDate(
      context: Get.context!,
      initialDate: selectedDate.value,
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime.now(),
    );

    if (pickedDate != null) {
      selectedDate.value = pickedDate;
      await loadData();
    }
  }

  bool isTagSelected(int userId) {
    return selectedTags.contains(userId);
  }

  void toggleTag(int userId) {
    if (selectedTags.contains(userId)) {
      selectedTags.remove(userId);
    } else {
      selectedTags.add(userId);
    }
    selectedTags.refresh();
  }

  List<DailyControlUser> get selectedTagUsers {
    if (selectedTags.isEmpty || teamUsers.isEmpty) {
      return const [];
    }

    final selectedSet = selectedTags.toSet();
    final users = teamUsers
        .where((u) => selectedSet.contains(u.idUser))
        .toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return users;
  }

  String get selectedTagSummary {
    final users = selectedTagUsers;
    if (users.isEmpty) {
      return '';
    }
    if (users.length == 1) {
      return users.first.name;
    }
    if (users.length <= 3) {
      return users.map((e) => e.name).join(', ');
    }
    return '${users.first.name} +${users.length - 1} user';
  }

  void clearTagUsers() {
    selectedTags.clear();
    selectedTags.refresh();
  }

  Future<void> pickTagUsers() async {
    final context = Get.context;
    if (context == null) {
      return;
    }

    final searchController = TextEditingController();
    final initialSelected = selectedTags.toSet();

    final picked = await showModalBottomSheet<Set<int>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        final tempSelected = <int>{...initialSelected};
        String keyword = '';

        List<DailyControlUser> filteredUsers() {
          final q = keyword.trim().toLowerCase();
          if (q.isEmpty) {
            return teamUsers.toList();
          }
          return teamUsers.where((user) {
            final name = [
              user.alias,
              user.name,
              user.fullname,
            ].join(' ').toLowerCase();
            final role = user.role.toLowerCase();
            return name.contains(q) || role.contains(q);
          }).toList();
        }

        return StatefulBuilder(
          builder: (context, setModalState) {
            final users = filteredUsers();
            return DraggableScrollableSheet(
              expand: false,
              minChildSize: 0.5,
              maxChildSize: 0.95,
              initialChildSize: 0.85,
              builder: (context, scrollController) {
                return Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(20)),
                  ),
                  padding: EdgeInsets.only(
                    left: 16,
                    right: 16,
                    top: 14,
                    bottom: MediaQuery.of(context).viewInsets.bottom + 14,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Tag User Follow-up',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Get.back(),
                          ),
                        ],
                      ),
                      TextField(
                        controller: searchController,
                        onChanged: (value) {
                          setModalState(() {
                            keyword = value;
                          });
                        },
                        decoration: InputDecoration(
                          hintText: 'Cari nama / role user...',
                          prefixIcon: const Icon(Icons.search),
                          filled: true,
                          fillColor: const Color(0xFFF8FAFC),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Expanded(
                        child: users.isEmpty
                            ? const Center(child: Text('User tidak ditemukan.'))
                            : ListView.separated(
                                controller: scrollController,
                                itemCount: users.length,
                                separatorBuilder: (_, __) =>
                                    const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  final user = users[index];
                                  final checked =
                                      tempSelected.contains(user.idUser);
                                  return CheckboxListTile(
                                    value: checked,
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(
                                      user.preferredDisplayName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    subtitle: Text(user.role),
                                    onChanged: (value) {
                                      setModalState(() {
                                        if (value == true) {
                                          tempSelected.add(user.idUser);
                                        } else {
                                          tempSelected.remove(user.idUser);
                                        }
                                      });
                                    },
                                  );
                                },
                              ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Get.back(),
                              child: const Text('Batal'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () => Get.back(result: tempSelected),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF2a5298),
                                foregroundColor: Colors.white,
                              ),
                              child: Text('Pilih (${tempSelected.length})'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );

    searchController.dispose();

    if (picked == null) {
      return;
    }

    final nextTags = picked.toList()..sort();
    selectedTags.assignAll(nextTags);
    selectedTags.refresh();
  }

  Future<void> pickAsset() async {
    final context = Get.context;
    if (context == null) {
      return;
    }

    final selected = await showSearch<DailyControlLookupOption?>(
      context: context,
      delegate: _DailyControlLookupSearchDelegate(
        title: 'Pilih Asset',
        hintText: 'Cari asset code, nama, company...',
        loader: (query) async {
          final rows = await _repository.getAssetOptions(term: query);
          return _mapLookupRows(rows);
        },
      ),
    );

    if (selected == null) {
      return;
    }

    final currentAssetCode = selectedAsset.value?.value ?? '';
    final newAssetCode = selected.value;

    selectedAsset.value = selected;
    if (newAssetCode != currentAssetCode) {
      clearPart();
      clearWo();
      await loadPartOptions();
    }
  }

  Future<void> pickWo() async {
    final context = Get.context;
    if (context == null) {
      return;
    }

    final selected = await showSearch<DailyControlLookupOption?>(
      context: context,
      delegate: _DailyControlLookupSearchDelegate(
        title: 'Pilih WO',
        hintText: 'Cari WO number atau judul...',
        loader: (query) async {
          final rows = await _repository.getWoOptions(
            term: query,
            assetCode: selectedAsset.value?.value ?? '',
          );
          return _mapLookupRows(rows);
        },
      ),
    );

    if (selected == null) {
      return;
    }
    selectedWo.value = selected;
  }

  Future<void> pickPart() async {
    final context = Get.context;
    if (context == null) {
      return;
    }

    final assetCode = selectedAsset.value?.value ?? '';
    if (assetCode.isEmpty) {
      Get.snackbar(
        'Daily Control',
        'Pilih Asset Code dulu.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFf59e0b),
        colorText: Colors.white,
      );
      return;
    }

    if (partOptions.isEmpty && !isPartLoading.value) {
      await loadPartOptions();
    }
    if (partOptions.isEmpty) {
      Get.snackbar(
        'Daily Control',
        'Part mesin tidak ditemukan untuk asset ini.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFF6b7280),
        colorText: Colors.white,
      );
      return;
    }

    final searchContext = Get.context;
    if (searchContext == null) {
      return;
    }

    final selected = await showSearch<DailyControlLookupOption?>(
      context: searchContext,
      delegate: _DailyControlLookupSearchDelegate(
        title: 'Pilih Part Mesin',
        hintText: 'Cari part mesin...',
        loader: (query) async {
          final keyword = query.trim().toLowerCase();
          if (keyword.isEmpty) {
            return partOptions.toList();
          }
          return partOptions
              .where((e) => e.label.toLowerCase().contains(keyword))
              .toList();
        },
      ),
    );

    if (selected == null) {
      return;
    }
    selectedPart.value = selected;
  }

  Future<void> loadPartOptions() async {
    final assetCode = selectedAsset.value?.value ?? '';
    if (assetCode.isEmpty) {
      partOptions.clear();
      return;
    }

    try {
      isPartLoading.value = true;
      final rows = await _repository.getAssetPartOptions(assetCode: assetCode);
      partOptions.assignAll(_mapLookupRows(rows));
    } catch (e) {
      partOptions.clear();
      Get.snackbar(
        'Daily Control',
        'Gagal memuat part: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFdc2626),
        colorText: Colors.white,
      );
    } finally {
      isPartLoading.value = false;
    }
  }

  void clearAsset() {
    selectedAsset.value = null;
    clearPart();
    clearWo();
  }

  void clearPart() {
    selectedPart.value = null;
    partOptions.clear();
  }

  void clearWo() {
    selectedWo.value = null;
  }

  void clearComposer() {
    activityController.clear();
    titleController.clear();
    clearAsset();
    selectedTags.clear();
    draftMedia.clear();
    draftMedia.refresh();
  }

  Future<void> capturePhotoFromCamera() async {
    if (isPickingMedia.value) {
      return;
    }
    try {
      isPickingMedia.value = true;
      final photo =
          await DailyControlImageEditorHelper.pickEditedImageFromCamera();
      if (photo == null) {
        Get.snackbar(
          'Daily Control',
          'Kamera dibatalkan atau izin kamera belum diberikan.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFf59e0b),
          colorText: Colors.white,
        );
        return;
      }

      final capturedAt = DateTime.now();
      final stamped = await MediaTimestampHelper.stampImage(photo, capturedAt);
      final mediaFile = stamped ?? photo;
      draftMedia.add(
        DailyControlDraftMedia(
          localPath: mediaFile.path,
          mediaType: 'image',
          capturedAt: capturedAt,
        ),
      );
      draftMedia.refresh();
    } catch (e) {
      Get.snackbar(
        'Daily Control',
        'Gagal ambil foto: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFdc2626),
        colorText: Colors.white,
      );
    } finally {
      isPickingMedia.value = false;
    }
  }

  Future<void> pickPhotoFromGalleryForPost() async {
    if (isPickingMedia.value) {
      return;
    }
    try {
      isPickingMedia.value = true;
      final photos =
          await DailyControlImageEditorHelper.pickEditedImagesFromGallery();
      if (photos.isEmpty) {
        return;
      }

      final capturedAt = DateTime.now();
      draftMedia.addAll(
        photos.map(
          (photo) => DailyControlDraftMedia(
            localPath: photo.path,
            mediaType: 'image',
            capturedAt: capturedAt,
          ),
        ),
      );
      draftMedia.refresh();
    } catch (e) {
      Get.snackbar(
        'Daily Control',
        'Gagal ambil foto dari galeri: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFdc2626),
        colorText: Colors.white,
      );
    } finally {
      isPickingMedia.value = false;
    }
  }

  Future<void> captureVideoFromCamera() async {
    if (isPickingMedia.value) {
      return;
    }
    try {
      isPickingMedia.value = true;
      final video = await MediaPickerHelper.pickVideoFromCamera();
      if (video == null) {
        Get.snackbar(
          'Daily Control',
          'Perekaman dibatalkan atau izin kamera belum diberikan.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFf59e0b),
          colorText: Colors.white,
        );
        return;
      }

      draftMedia.add(
        DailyControlDraftMedia(
          localPath: video.path,
          mediaType: 'video',
          capturedAt: DateTime.now(),
        ),
      );
      draftMedia.refresh();
    } catch (e) {
      Get.snackbar(
        'Daily Control',
        'Gagal ambil video: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFdc2626),
        colorText: Colors.white,
      );
    } finally {
      isPickingMedia.value = false;
    }
  }

  void removeDraftMediaAt(int index) {
    if (index < 0 || index >= draftMedia.length) {
      return;
    }
    draftMedia.removeAt(index);
    draftMedia.refresh();
  }

  Future<bool> submitPost() async {
    final notes = activityController.text.trim();
    if (notes.isEmpty) {
      Get.snackbar(
        'Daily Control',
        'Kegiatan wajib diisi.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFf59e0b),
        colorText: Colors.white,
      );
      return false;
    }

    try {
      isSaving.value = true;
      final response = await _repository.createDailyControl(
        activityDate: selectedDateKey,
        notes: notes,
        title: titleController.text.trim(),
        assetCode: selectedAsset.value?.value ?? '',
        partMesin: selectedPart.value?.value ?? '',
        woNumber: selectedWo.value?.value ?? '',
        tagUserIds: selectedTags.toList(),
        mediaFiles: draftMedia
            .map(
              (item) => <String, String>{
                'path': item.localPath,
                'media_type': item.mediaType,
                'captured_at': item.capturedAtIso,
              },
            )
            .toList(),
        status: 'POSTED',
      );

      if (response['status'] == true) {
        clearComposer();
        await loadData();
        Get.snackbar(
          'Daily Control',
          'Kegiatan berhasil diposting.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF16a34a),
          colorText: Colors.white,
        );
        return true;
      } else {
        throw Exception(response['message'] ?? 'Gagal menyimpan Daily Control');
      }
    } catch (e) {
      Get.snackbar(
        'Daily Control',
        'Gagal menyimpan: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFdc2626),
        colorText: Colors.white,
      );
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  final Map<int, List<DailyControlComment>> _commentCache = {};
  final Map<int, List<DailyControlPartMention>> _partMentionCache = {};

  List<DailyControlComment>? getCachedComments(int dailyControlId) {
    return _commentCache[dailyControlId];
  }

  Future<List<DailyControlComment>> getComments(int dailyControlId,
      {bool useCache = true}) async {
    if (dailyControlId <= 0) {
      return [];
    }
    if (useCache && _commentCache.containsKey(dailyControlId)) {
      return _commentCache[dailyControlId]!;
    }
    final rows = await _repository.getComments(dailyControlId: dailyControlId);
    final comments =
        rows.map((item) => DailyControlComment.fromJson(item)).toList();
    _commentCache[dailyControlId] = comments;
    return comments;
  }

  Future<List<DailyControlPartMention>> getPartMentions(int dailyControlId,
      {bool useCache = true}) async {
    if (dailyControlId <= 0) {
      return [];
    }
    if (useCache && _partMentionCache.containsKey(dailyControlId)) {
      return _partMentionCache[dailyControlId]!;
    }
    final rows = await _repository.getPartMentions(
      dailyControlId: dailyControlId,
    );
    final mentions =
        rows.map((item) => DailyControlPartMention.fromJson(item)).toList();
    _partMentionCache[dailyControlId] = mentions;
    return mentions;
  }

  void clearCommentCache(int dailyControlId) {
    _commentCache.remove(dailyControlId);
    _partMentionCache.remove(dailyControlId);
  }

  Future<DailyControlComment?> createComment({
    required int dailyControlId,
    required String message,
    int? parentId,
    List<String> mediaFilePaths = const [],
  }) async {
    final text = message.trim();
    if (dailyControlId <= 0 || (text.isEmpty && mediaFilePaths.isEmpty)) {
      return null;
    }
    final response = await _repository.createComment(
      dailyControlId: dailyControlId,
      message: text,
      parentId: parentId,
      mediaFilePaths: mediaFilePaths,
    );
    if (response['status'] == true && response['data'] is Map) {
      clearCommentCache(dailyControlId);
      final index = activities.indexWhere((a) => a.id == dailyControlId);
      if (index >= 0) {
        final activity = activities[index];
        activities[index] = DailyControlActivity(
          id: activity.id,
          idUser: activity.idUser,
          user: activity.user,
          division: activity.division,
          divisionCode: activity.divisionCode,
          date: activity.date,
          time: activity.time,
          title: activity.title,
          notes: activity.notes,
          assetCode: activity.assetCode,
          assetName: activity.assetName,
          partMesin: activity.partMesin,
          woNumber: activity.woNumber,
          maintenanceKind: activity.maintenanceKind,
          maintenanceActionLabel: activity.maintenanceActionLabel,
          requestPartLabel: activity.requestPartLabel,
          executorCodeRaw: activity.executorCodeRaw,
          mesoSubtype: activity.mesoSubtype,
          sourceTable: activity.sourceTable,
          mtcAreaKey: activity.mtcAreaKey,
          media: activity.media,
          commentCount: activity.commentCount + 1,
          unreadCount: activity.unreadCount,
          tags: activity.tags,
          followUps: activity.followUps,
          participantUserIds: activity.participantUserIds,
          participantNames: activity.participantNames,
          laborNames: activity.laborNames,
          readerNames: activity.readerNames,
          displayFullname: activity.displayFullname,
        );
        activities.refresh();
      }
      return DailyControlComment.fromJson(
        Map<String, dynamic>.from(response['data'] as Map),
      );
    }
    return null;
  }

  Future<void> markAsRead(int dailyControlId) async {
    if (dailyControlId <= 0) {
      return;
    }

    // Perbarui daftar secara optimistis agar ketika dialog chat ditutup,
    // pengguna langsung melihat daftar unread terbaru tanpa menunggu API.
    final unreadIndex = unreadActivities.indexWhere(
      (activity) => activity.id == dailyControlId,
    );
    final unreadActivity =
        unreadIndex >= 0 ? unreadActivities.removeAt(unreadIndex) : null;
    if (unreadActivity != null && unreadActivityCount.value > 0) {
      unreadActivityCount.value--;
    }

    void restoreUnreadActivity() {
      if (unreadActivity == null ||
          unreadActivities.any((activity) => activity.id == dailyControlId)) {
        return;
      }
      unreadActivities.insert(
        unreadIndex.clamp(0, unreadActivities.length),
        unreadActivity,
      );
      unreadActivityCount.value++;
    }

    try {
      final response = await _repository.markAsRead(
        dailyControlId: dailyControlId,
      );
      if (response['status'] == true) {
        final index = activities.indexWhere((a) => a.id == dailyControlId);
        if (index >= 0) {
          final activity = activities[index];
          final data = response['data'] is Map<String, dynamic>
              ? response['data'] as Map<String, dynamic>
              : response['data'] is Map
                  ? Map<String, dynamic>.from(response['data'] as Map)
                  : <String, dynamic>{};
          final readerNamesRaw = (data['reader_names'] as List?) ?? const [];
          final readerNames = readerNamesRaw
              .map((item) => '$item'.trim())
              .where((item) => item.isNotEmpty)
              .toSet()
              .toList();
          activities[index] = DailyControlActivity(
            id: activity.id,
            idUser: activity.idUser,
            user: activity.user,
            division: activity.division,
            divisionCode: activity.divisionCode,
            date: activity.date,
            time: activity.time,
            title: activity.title,
            notes: activity.notes,
            assetCode: activity.assetCode,
            assetName: activity.assetName,
            partMesin: activity.partMesin,
            woNumber: activity.woNumber,
            maintenanceKind: activity.maintenanceKind,
            maintenanceActionLabel: activity.maintenanceActionLabel,
            requestPartLabel: activity.requestPartLabel,
            executorCodeRaw: activity.executorCodeRaw,
            mesoSubtype: activity.mesoSubtype,
            sourceTable: activity.sourceTable,
            mtcAreaKey: activity.mtcAreaKey,
            media: activity.media,
            commentCount: activity.commentCount,
            unreadCount: 0,
            tags: activity.tags,
            followUps: activity.followUps,
            participantUserIds: activity.participantUserIds,
            participantNames: activity.participantNames,
            laborNames: activity.laborNames,
            readerNames:
                readerNames.isNotEmpty ? readerNames : activity.readerNames,
            displayFullname: activity.displayFullname,
          );
          activities.refresh();
          await _syncBadgeCountFromActivities();
        }
      } else {
        restoreUnreadActivity();
      }
    } catch (e) {
      restoreUnreadActivity();
      debugPrint('Mark as read failed: $e');
    }
  }

  void applyNotificationTarget({
    required int dailyControlId,
    String? activityDate,
    Map<String, dynamic>? payload,
    bool shouldReload = true,
  }) {
    if (dailyControlId <= 0) {
      return;
    }

    pendingOpenActivityId.value = dailyControlId;
    hasRetriedPendingNotificationOpen.value = false;
    pendingNotificationPayload = <String, dynamic>{
      ...?payload,
      'daily_control_id': dailyControlId,
      'activity_date': activityDate ?? payload?['activity_date'] ?? '',
    };

    bool dateChanged = false;
    final parsedDate = _parseActivityDate(activityDate);
    if (parsedDate != null && !_isSameDate(parsedDate, selectedDate.value)) {
      selectedDate.value = parsedDate;
      dateChanged = true;
    }

    if (shouldReload &&
        (dateChanged ||
            activities.every((item) => item.id != dailyControlId))) {
      loadData();
    }
  }

  DailyControlActivity? findActivityById(int dailyControlId) {
    if (dailyControlId <= 0) {
      return null;
    }

    for (final activity in activities) {
      if (activity.id == dailyControlId) {
        return activity;
      }
    }

    return null;
  }

  void clearPendingOpenActivity() {
    pendingOpenActivityId.value = null;
    hasRetriedPendingNotificationOpen.value = false;
  }

  void requestOpenUnreadList() {
    pendingOpenUnreadList.value = true;
  }

  void clearPendingOpenUnreadList() {
    pendingOpenUnreadList.value = false;
  }

  DateTime? _parseActivityDate(String? value) {
    final raw = value?.trim() ?? '';
    if (raw.isEmpty) {
      return null;
    }

    try {
      return DateFormat('yyyy-MM-dd').parseStrict(raw);
    } catch (_) {
      return null;
    }
  }

  bool _isSameDate(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  Future<void> _syncBadgeCountFromActivities() async {
    // Hitung dari local activities dulu (instant, no API)
    final localUnread = activities.where((a) => a.unreadCount > 0).length;
    if (localUnread > 0) {
      // Ada unread di tanggal ini → langsung set badge
      await PushNotificationService.instance
          .setDailyControlBadgeCount(localUnread);
    }
    // Jangan overwrite badge dengan 0 jika local kosong
    // (mungkin ada unread di tanggal lain)
  }

  Future<void> loadUnreadActivities({bool showLoader = true}) async {
    try {
      if (showLoader) {
        isLoadingUnreadActivities.value = true;
      }

      final response = await _repository.getUnreadActivities(limit: 200);
      if (response['status'] == true && response['data'] is Map) {
        final data = response['data'] as Map<String, dynamic>;
        final rows = (data['items'] as List?) ?? const [];
        final parsed = rows
            .map(
              (item) => DailyControlUnreadActivity.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .where((item) => item.id > 0 && item.unreadCount > 0)
            .toList();
        // Update badge dari total unread activities (semua tanggal)
        final totalUnread = parsed.length;
        _hasLoadedUnreadActivityCount = true;
        unreadActivityCount.value = totalUnread;
        if (totalUnread > 0) {
          await PushNotificationService.instance
              .setDailyControlBadgeCount(totalUnread);
        }
        unreadActivities.assignAll(parsed);
        return;
      }
      // Response tidak sukses → jangan clear, biarkan data lama
    } catch (_) {
      // Error → jangan clear, biarkan data lama
    } finally {
      if (showLoader) {
        isLoadingUnreadActivities.value = false;
      }
    }
  }

  bool _isTodayDate(DateTime value) {
    final now = DateTime.now();
    return value.year == now.year &&
        value.month == now.month &&
        value.day == now.day;
  }

  List<DailyControlLookupOption> _mapLookupRows(
    List<Map<String, dynamic>> rows,
  ) {
    final items = <DailyControlLookupOption>[];
    for (final row in rows) {
      final value = '${row['id'] ?? row['value'] ?? ''}'.trim();
      if (value.isEmpty) {
        continue;
      }
      final labelRaw = '${row['text'] ?? row['label'] ?? value}'.trim();
      final label = labelRaw.isEmpty ? value : labelRaw;
      items.add(DailyControlLookupOption(value: value, label: label));
    }
    return items;
  }
}

class _DailyControlLookupSearchDelegate
    extends SearchDelegate<DailyControlLookupOption?> {
  _DailyControlLookupSearchDelegate({
    required this.title,
    required this.hintText,
    required this.loader,
  }) : super(searchFieldLabel: hintText);

  final String title;
  final String hintText;
  final Future<List<DailyControlLookupOption>> Function(String query) loader;

  @override
  String get searchFieldLabel => hintText;

  @override
  ThemeData appBarTheme(BuildContext context) {
    final base = Theme.of(context);
    return base.copyWith(
      appBarTheme: base.appBarTheme.copyWith(
        backgroundColor: const Color(0xFF2a5298),
        foregroundColor: Colors.white,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        hintStyle: TextStyle(color: Colors.white70),
        border: InputBorder.none,
      ),
      textTheme: base.textTheme.copyWith(
        titleLarge: base.textTheme.titleLarge?.copyWith(
          color: Colors.white,
          fontSize: 18,
        ),
      ),
    );
  }

  @override
  List<Widget>? buildActions(BuildContext context) {
    return [
      if (query.isNotEmpty)
        IconButton(icon: const Icon(Icons.clear), onPressed: () => query = ''),
    ];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: () => close(context, null),
    );
  }

  @override
  Widget buildResults(BuildContext context) {
    return _buildSuggestionBody(context);
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    return _buildSuggestionBody(context);
  }

  Widget _buildSuggestionBody(BuildContext context) {
    return FutureBuilder<List<DailyControlLookupOption>>(
      future: loader(query),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Gagal memuat data.\n${snapshot.error}',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }

        final items = snapshot.data ?? const [];
        if (items.isEmpty) {
          return const Center(child: Text('Tidak ada data.'));
        }

        return ListView.separated(
          itemCount: items.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final item = items[index];
            return ListTile(
              title: Text(
                item.value,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: item.label != item.value
                  ? Text(
                      item.label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    )
                  : null,
              onTap: () => close(context, item),
            );
          },
        );
      },
    );
  }
}
