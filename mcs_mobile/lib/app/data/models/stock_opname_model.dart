class StockOpname {
  final String noSO;
  final String tgl;
  final bool isBOM;
  final String? lockedDate; // nullable agar bisa null jika belum dikunci
  final String workflowStatus;
  final List<String> companies;
  final List<String> categories;
  final List<String> locations;

  StockOpname({
    required this.noSO,
    required this.tgl,
    required this.isBOM,
    required this.lockedDate,
    required this.workflowStatus,
    required this.companies,
    required this.categories,
    required this.locations,
  });

  factory StockOpname.fromJson(Map<String, dynamic> json) {
    return StockOpname(
      noSO: json['NoSO'] ?? 'N/A',
      tgl: json['Tanggal'] ?? 'N/A',
      isBOM: json['IsBOM'] == 1,
      lockedDate: json['LockedDate'], // langsung ambil string (nullable)
      workflowStatus: '${json['workflow_status'] ?? (json['LockedDate'] != null ? 'LOCKED' : 'COUNTING')}'.toUpperCase(),
      companies: json['companies'] != null && json['companies'] is List
          ? List<String>.from(json['companies'])
          : ['N/A'],
      categories: json['categories'] != null && json['categories'] is List
          ? List<String>.from(json['categories'])
          : ['N/A'],
      locations: json['locations'] != null && json['locations'] is List
          ? List<String>.from(json['locations'])
          : ['N/A'],
    );
  }

  bool get isLocked {
    final sourceLocked = lockedDate != null &&
        lockedDate!.isNotEmpty &&
        lockedDate != '0000-00-00' &&
        lockedDate != '-';
    return sourceLocked || !const ['COUNTING', 'RECOUNT'].contains(workflowStatus);
  }
}

class StockOpnameScheduleAssignment {
  final int id;
  final String name;
  final String recurrence;
  final String nextRunDate;
  final bool isBOM;
  final List<String> companies;
  final List<String> categories;
  final List<String> locations;
  final String? lastNoSO;
  final String? lastRunStatus;

  const StockOpnameScheduleAssignment({
    required this.id,
    required this.name,
    required this.recurrence,
    required this.nextRunDate,
    required this.isBOM,
    required this.companies,
    required this.categories,
    required this.locations,
    this.lastNoSO,
    this.lastRunStatus,
  });

  factory StockOpnameScheduleAssignment.fromJson(Map<String, dynamic> json) =>
      StockOpnameScheduleAssignment(
        id: int.tryParse('${json['id'] ?? 0}') ?? 0,
        name: '${json['schedule_name'] ?? 'Jadwal Stock Opname'}',
        recurrence: '${json['recurrence_type'] ?? ''}',
        nextRunDate: '${json['next_run_date'] ?? ''}'.split('T').first,
        isBOM: '${json['is_bom'] ?? 0}' == '1' || json['is_bom'] == true,
        companies: _strings(json['company_ids']),
        categories: _strings(json['category_ids']),
        locations: json['location_assignments'] is List
            ? (json['location_assignments'] as List)
                .map((item) => item is Map
                    ? '${item['location_name'] ?? item['location_id'] ?? ''}'
                    : '')
                .where((item) => item.isNotEmpty)
                .toList()
            : const [],
        lastNoSO: json['last_no_so']?.toString(),
        lastRunStatus: json['last_run_status']?.toString(),
      );

  static List<String> _strings(dynamic value) => value is List
      ? value.map((item) => '$item').where((item) => item.isNotEmpty).toList()
      : const [];
}
