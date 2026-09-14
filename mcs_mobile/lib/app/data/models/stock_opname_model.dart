class StockOpname {
  final String noSO;
  final String tgl;
  final bool isBOM;
  final String? lockedDate; // nullable agar bisa null jika belum dikunci
  final List<String> companies;
  final List<String> categories;
  final List<String> locations;

  StockOpname({
    required this.noSO,
    required this.tgl,
    required this.isBOM,
    required this.lockedDate,
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

  bool get isLocked =>
      lockedDate != null &&
          lockedDate!.isNotEmpty &&
          lockedDate != '0000-00-00' &&
          lockedDate != '-';
}
