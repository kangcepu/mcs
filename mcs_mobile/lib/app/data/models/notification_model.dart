class NotificationSummary {
  final bool status;
  final String message;
  final NotificationData? data;

  NotificationSummary({
    required this.status,
    required this.message,
    this.data,
  });

  factory NotificationSummary.fromJson(Map<String, dynamic> json) {
    return NotificationSummary(
      status: json['status'] ?? false,
      message: json['message'] ?? '',
      data:
          json['data'] != null ? NotificationData.fromJson(json['data']) : null,
    );
  }
}

int _toInt(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is double) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

class NotificationData {
  final int totalNotifications;
  final List<PreventiveWo> preventiveWo;
  final List<PreventiveWo> inProgressWo;
  final NotificationSummaryDetail summary;

  NotificationData({
    required this.totalNotifications,
    required this.preventiveWo,
    required this.inProgressWo,
    required this.summary,
  });

  factory NotificationData.fromJson(Map<String, dynamic> json) {
    final preventiveList = (json['preventive_wo'] as List<dynamic>?)
            ?.map((e) => PreventiveWo.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final inProgressList = (json['in_progress_wo'] as List<dynamic>?)
            ?.map((e) => PreventiveWo.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final summary = NotificationSummaryDetail.fromJson(json['summary'] ?? {});
    final fallbackTotal = preventiveList.length + inProgressList.length;
    final total = _toInt(json['total_notifications']);

    return NotificationData(
      totalNotifications: total > 0 ? total : fallbackTotal,
      preventiveWo: preventiveList,
      inProgressWo: inProgressList,
      summary: summary,
    );
  }
}

class PreventiveWo {
  final String woNumber;
  final String date;
  final String jobTitle;
  final String? company;
  final String status;
  final String? pic;
  final String? jobExecutor;
  final String? typeWo;
  final String? assetName;
  final String? assetId;
  final String? divisionName;
  final String? divisionCode;

  PreventiveWo({
    required this.woNumber,
    required this.date,
    required this.jobTitle,
    this.company,
    required this.status,
    this.pic,
    this.jobExecutor,
    this.typeWo,
    this.assetName,
    this.assetId,
    this.divisionName,
    this.divisionCode,
  });

  factory PreventiveWo.fromJson(Map<String, dynamic> json) {
    return PreventiveWo(
      woNumber: json['wo_number'] ?? '',
      date: json['date'] ?? '',
      jobTitle: json['job_title'] ?? '',
      company: json['company'],
      status: json['status'] ?? '',
      pic: json['pic'],
      jobExecutor: json['job_executor'],
      typeWo: json['type_wo'],
      assetName: json['AssetName'],
      assetId: json['AssetID']?.toString(),
      divisionName: json['division_name'],
      divisionCode: json['division_code'],
    );
  }
}

class NotificationSummaryDetail {
  final int totalPreventive;
  final int totalInProgress;

  NotificationSummaryDetail({
    required this.totalPreventive,
    required this.totalInProgress,
  });

  factory NotificationSummaryDetail.fromJson(Map<String, dynamic> json) {
    return NotificationSummaryDetail(
      totalPreventive: _toInt(json['total_preventive']),
      totalInProgress: _toInt(json['total_in_progress']),
    );
  }
}
