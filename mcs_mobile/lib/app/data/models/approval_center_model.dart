class ApprovalSummary {
  final int woApprovals;
  final int woClosings;
  final int mutations;
  final int materials;
  final Map<String, int> categories;

  const ApprovalSummary({
    required this.woApprovals,
    required this.woClosings,
    required this.mutations,
    required this.materials,
    this.categories = const <String, int>{},
  });

  factory ApprovalSummary.fromJson(Map<String, dynamic> json) {
    final source = json['summary'] is Map<String, dynamic>
        ? json['summary'] as Map<String, dynamic>
        : json;

    return ApprovalSummary(
      woApprovals: _parseInt(
        source['wo_approvals'] ?? source['wo_approval'],
      ),
      woClosings: _parseInt(
        source['wo_closings'] ?? source['wo_close'],
      ),
      mutations: _parseInt(source['mutations'] ?? source['mutation']),
      materials: _parseInt(source['materials'] ?? source['material']),
      categories: _parseCategories(json['categories'] ?? source['categories']),
    );
  }

  int get total => woApprovals + woClosings + mutations + materials;

  int categoryCount(String key) => categories[key] ?? 0;

  static int _parseInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    return int.tryParse(value.toString()) ?? 0;
  }

  static Map<String, int> _parseCategories(dynamic value) {
    if (value is! Map) {
      return const <String, int>{};
    }

    final result = <String, int>{};
    value.forEach((key, val) {
      result[key.toString()] = _parseInt(val);
    });
    return result;
  }
}

class ApprovalItem {
  final String moduleKey;
  final String moduleLabel;
  final String woNumber;
  final String date;
  final String company;
  final String jobTitle;
  final String status;
  final String assetName;
  final String actionLabel;
  final String actionType;
  final String requestCode;
  final String typeWo;
  final String jobExecutor;
  final String docNo;
  final String locationBefore;
  final String companyBefore;
  final String creator;

  const ApprovalItem({
    this.moduleKey = '',
    this.moduleLabel = '',
    this.woNumber = '',
    this.date = '',
    this.company = '',
    this.jobTitle = '',
    this.status = '',
    this.assetName = '',
    this.actionLabel = '',
    this.actionType = '',
    this.requestCode = '',
    this.typeWo = '',
    this.jobExecutor = '',
    this.docNo = '',
    this.locationBefore = '',
    this.companyBefore = '',
    this.creator = '',
  });

  factory ApprovalItem.fromJson(Map<String, dynamic> json) {
    return ApprovalItem(
      moduleKey: json['module_key']?.toString() ?? '',
      moduleLabel: json['module_label']?.toString() ?? '',
      woNumber: json['wo_number']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      company: json['company']?.toString() ?? '',
      jobTitle: json['job_title']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      assetName: json['asset_name']?.toString() ?? '',
      actionLabel: json['action_label']?.toString() ?? '',
      actionType: json['action_type']?.toString() ?? '',
      requestCode: json['request_code']?.toString() ?? '',
      typeWo: json['type_wo']?.toString() ?? '',
      jobExecutor: json['job_executor']?.toString() ?? '',
      docNo: json['doc_no']?.toString() ?? '',
      locationBefore: json['location_before']?.toString() ?? '',
      companyBefore: json['company_before']?.toString() ?? '',
      creator: json['creator']?.toString() ?? '',
    );
  }

  String get primaryCode {
    if (woNumber.isNotEmpty) return woNumber;
    if (docNo.isNotEmpty) return docNo;
    if (requestCode.isNotEmpty) return requestCode;
    return '-';
  }

  String get companyLabel {
    if (company.isNotEmpty) return company;
    if (companyBefore.isNotEmpty) return companyBefore;
    return '-';
  }
}
