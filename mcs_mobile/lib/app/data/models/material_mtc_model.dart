class MaterialMtc {
  final int idDetailMaterial;
  final String woNumber;
  final String jobExecutor;
  final String material;
  final double qty;
  final String unit;
  final String? pr;
  final String forType;

  MaterialMtc({
    required this.idDetailMaterial,
    required this.woNumber,
    required this.jobExecutor,
    required this.material,
    required this.qty,
    required this.unit,
    this.pr,
    required this.forType,
  });

  static int _toInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString()) ?? 0;
  }

  static double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  factory MaterialMtc.fromJson(Map<String, dynamic> json) {
    return MaterialMtc(
      idDetailMaterial: _toInt(json['id_detail_material']),
      woNumber: json['wo_number'] ?? '',
      jobExecutor: json['job_executor'] ?? '',
      material: json['material'] ?? '',
      qty: _toDouble(json['qty']),
      unit: json['unit'] ?? '',
      pr: json['pr'],
      forType: json['for'] ?? 'MTC',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_detail_material': idDetailMaterial,
      'wo_number': woNumber,
      'job_executor': jobExecutor,
      'material': material,
      'qty': qty,
      'unit': unit,
      'pr': pr,
      'for': forType,
    };
  }

  MaterialMtc copyWith({
    int? idDetailMaterial,
    String? woNumber,
    String? jobExecutor,
    String? material,
    double? qty,
    String? unit,
    String? pr,
    String? forType,
  }) {
    return MaterialMtc(
      idDetailMaterial: idDetailMaterial ?? this.idDetailMaterial,
      woNumber: woNumber ?? this.woNumber,
      jobExecutor: jobExecutor ?? this.jobExecutor,
      material: material ?? this.material,
      qty: qty ?? this.qty,
      unit: unit ?? this.unit,
      pr: pr ?? this.pr,
      forType: forType ?? this.forType,
    );
  }
}
