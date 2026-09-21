class WorkOrderMtc {
  final String woNumber;
  final String date;
  final String? assetName;
  final String? idEquipment;
  final String? company;
  final String? shift;
  final String jobTitle;
  final String typeWo;
  final String? priority;
  final String? runningHours;
  final String? jobRequirement;
  final String? jobExplanation;
  final String? jobExecutor;
  final String? attachment;
  final String status;
  final String? pic;
  final String? reason;
  final String? divisionCode;
  final String? divisionName;
  final int? idDivision;
  final String? location;
  final int? isExternal;
  final String? creator;
  final String? createdAt;
  final String? updatedAt;

  WorkOrderMtc({
    required this.woNumber,
    required this.date,
    this.assetName,
    this.idEquipment,
    this.company,
    this.shift,
    required this.jobTitle,
    required this.typeWo,
    this.priority,
    this.runningHours,
    this.jobRequirement,
    this.jobExplanation,
    this.jobExecutor,
    this.attachment,
    required this.status,
    this.pic,
    this.reason,
    this.divisionCode,
    this.divisionName,
    this.idDivision,
    this.location,
    this.isExternal,
    this.creator,
    this.createdAt,
    this.updatedAt,
  });

  factory WorkOrderMtc.fromJson(Map<String, dynamic> json) {
    return WorkOrderMtc(
      woNumber: json['wo_number'] ?? '',
      date: json['date'] ?? '',
      assetName: json['AssetName'],
      idEquipment: json['id_equipment']?.toString(),
      company: json['company'],
      shift: json['shift'],
      jobTitle: json['job_title'] ?? '',
      typeWo: json['type_wo'] ?? '',
      priority: json['priority'],
      runningHours: json['running_hours'],
      jobRequirement: json['job_requirement'],
      jobExplanation: json['job_explanation'],
      jobExecutor: json['job_executor'],
      attachment: json['attachment'],
      status: json['status'] ?? '',
      pic: json['pic'],
      reason: json['reason'],
      divisionCode: json['division_code'],
      divisionName: json['division_name'],
      idDivision: json['id_division'] != null
          ? int.tryParse(json['id_division'].toString())
          : null,
      location: json['location'],
      isExternal: json['is_external'] != null
          ? int.tryParse(json['is_external'].toString())
          : null,
      creator: json['creator'],
      createdAt: json['created_at'],
      updatedAt: json['updated_at'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'wo_number': woNumber,
      'date': date,
      'AssetName': assetName,
      'id_equipment': idEquipment,
      'company': company,
      'shift': shift,
      'job_title': jobTitle,
      'type_wo': typeWo,
      'priority': priority,
      'running_hours': runningHours,
      'job_requirement': jobRequirement,
      'job_explanation': jobExplanation,
      'job_executor': jobExecutor,
      'attachment': attachment,
      'status': status,
      'pic': pic,
      'reason': reason,
      'division_code': divisionCode,
      'division_name': divisionName,
      'id_division': idDivision,
      'location': location,
      'is_external': isExternal,
      'creator': creator,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  List<String> getAttachments() {
    if (attachment == null || attachment!.isEmpty) return [];
    return attachment!
        .split(',')
        .map((file) => file.trim())
        .where((file) => file.isNotEmpty && file != '#')
        .toList();
  }

  WorkOrderMtc copyWith({
    String? woNumber,
    String? date,
    String? assetName,
    String? idEquipment,
    String? company,
    String? shift,
    String? jobTitle,
    String? typeWo,
    String? priority,
    String? runningHours,
    String? jobRequirement,
    String? jobExplanation,
    String? jobExecutor,
    String? attachment,
    String? status,
    String? pic,
    String? reason,
    String? divisionCode,
    String? divisionName,
    int? idDivision,
    String? location,
    int? isExternal,
    String? creator,
    String? createdAt,
    String? updatedAt,
  }) {
    return WorkOrderMtc(
      woNumber: woNumber ?? this.woNumber,
      date: date ?? this.date,
      assetName: assetName ?? this.assetName,
      idEquipment: idEquipment ?? this.idEquipment,
      company: company ?? this.company,
      shift: shift ?? this.shift,
      jobTitle: jobTitle ?? this.jobTitle,
      typeWo: typeWo ?? this.typeWo,
      priority: priority ?? this.priority,
      runningHours: runningHours ?? this.runningHours,
      jobRequirement: jobRequirement ?? this.jobRequirement,
      jobExplanation: jobExplanation ?? this.jobExplanation,
      jobExecutor: jobExecutor ?? this.jobExecutor,
      attachment: attachment ?? this.attachment,
      status: status ?? this.status,
      pic: pic ?? this.pic,
      reason: reason ?? this.reason,
      divisionCode: divisionCode ?? this.divisionCode,
      divisionName: divisionName ?? this.divisionName,
      idDivision: idDivision ?? this.idDivision,
      location: location ?? this.location,
      isExternal: isExternal ?? this.isExternal,
      creator: creator ?? this.creator,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
