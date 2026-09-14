class MaterialRequest {
  final int? id;
  final String woNumber;
  final String level;
  final String part;
  final double materialRequest;
  final String jobExecutor;
  final String uomRequest;
  final String requestCode;
  final String? date;
  final double? materialReceive;
  final String? uomReceive;
  final String? receiveDate;

  MaterialRequest({
    this.id,
    required this.woNumber,
    required this.level,
    required this.part,
    required this.materialRequest,
    required this.jobExecutor,
    required this.uomRequest,
    required this.requestCode,
    this.date,
    this.materialReceive,
    this.uomReceive,
    this.receiveDate,
  });

  static double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  static int? _toIntNullable(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString());
  }

  static String _toStringValue(dynamic value) {
    if (value == null) return '';
    return value.toString();
  }

  factory MaterialRequest.fromJson(Map<String, dynamic> json) {
    return MaterialRequest(
      id: _toIntNullable(json['id']),
      woNumber: _toStringValue(json['wo_number']),
      level: _toStringValue(json['level']),
      part: _toStringValue(json['part'] ?? json['material']),
      materialRequest:
          _toDouble(json['material_request'] ?? json['qty'] ?? json['quantity']),
      jobExecutor: _toStringValue(json['job_executor']),
      uomRequest: _toStringValue(
        json['uom_request'] ?? json['unit'] ?? json['uom_purchase'],
      ),
      requestCode: _toStringValue(json['request_code'] ?? json['pr']),
      date: json['date']?.toString(),
      materialReceive: (json['material_receive'] ??
                  json['receive_qty'] ??
                  json['qty_receive']) !=
              null
          ? _toDouble(
              json['material_receive'] ??
                  json['receive_qty'] ??
                  json['qty_receive'],
            )
          : null,
      uomReceive: (json['uom_receive'] ??
              json['receive_uom'] ??
              json['uom_received'])
          ?.toString(),
      receiveDate: (json['receive_date'] ?? json['date_receive'])?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'wo_number': woNumber,
      'level': level,
      'part': part,
      'material_request': materialRequest,
      'job_executor': jobExecutor,
      'uom_request': uomRequest,
      'request_code': requestCode,
      'date': date,
      'material_receive': materialReceive,
      'uom_receive': uomReceive,
      'receive_date': receiveDate,
    };
  }

  MaterialRequest copyWith({
    int? id,
    String? woNumber,
    String? level,
    String? part,
    double? materialRequest,
    String? jobExecutor,
    String? uomRequest,
    String? requestCode,
    String? date,
    double? materialReceive,
    String? uomReceive,
    String? receiveDate,
  }) {
    return MaterialRequest(
      id: id ?? this.id,
      woNumber: woNumber ?? this.woNumber,
      level: level ?? this.level,
      part: part ?? this.part,
      materialRequest: materialRequest ?? this.materialRequest,
      jobExecutor: jobExecutor ?? this.jobExecutor,
      uomRequest: uomRequest ?? this.uomRequest,
      requestCode: requestCode ?? this.requestCode,
      date: date ?? this.date,
      materialReceive: materialReceive ?? this.materialReceive,
      uomReceive: uomReceive ?? this.uomReceive,
      receiveDate: receiveDate ?? this.receiveDate,
    );
  }

  bool get isReceived => materialReceive != null && materialReceive! > 0;

  double get remainingQty {
    if (materialReceive == null) return materialRequest;
    return materialRequest - materialReceive!;
  }
}
