class WorkOrder {
  final String woNumber;
  final String date;
  final String? assetName;
  final String? company;
  final String jobTitle;
  final String typeWo;
  final String status;
  final String? divisionName;
  final String? pic;
  final String? creator;
  final String? createdAt;
  final String? updatedAt;
  final String? priority;

  WorkOrder({
    required this.woNumber,
    required this.date,
    this.assetName,
    this.company,
    required this.jobTitle,
    required this.typeWo,
    required this.status,
    this.divisionName,
    this.pic,
    this.creator,
    this.createdAt,
    this.updatedAt,
    this.priority,
  });

  factory WorkOrder.fromJson(Map<String, dynamic> json) {
    return WorkOrder(
      woNumber: json['wo_number'] ?? '',
      date: json['date'] ?? '',
      assetName: json['AssetName'],
      company: json['company'],
      jobTitle: json['job_title'] ?? '',
      typeWo: json['type_wo'] ?? '',
      status: json['status'] ?? '',
      divisionName: json['division_name'],
      pic: json['pic'],
      creator: json['creator'],
      createdAt: json['created_at'],
      updatedAt: json['updated_at'],
      priority: json['priority'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'wo_number': woNumber,
      'date': date,
      'AssetName': assetName,
      'company': company,
      'job_title': jobTitle,
      'type_wo': typeWo,
      'status': status,
      'division_name': divisionName,
      'pic': pic,
      'creator': creator,
      'created_at': createdAt,
      'updated_at': updatedAt,
      'priority': priority,
    };
  }
}