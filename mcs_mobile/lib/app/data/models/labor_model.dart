class Labor {
  final int idDetailLabor;
  final String woNumber;
  final String jobExecutor;
  final String trade;
  final int men;
  final double hours;
  final String forType;

  Labor({
    required this.idDetailLabor,
    required this.woNumber,
    required this.jobExecutor,
    required this.trade,
    required this.men,
    required this.hours,
    required this.forType,
  });

  factory Labor.fromJson(Map<String, dynamic> json) {
    return Labor(
      idDetailLabor: int.tryParse(json['id_detail_labor']?.toString() ?? '0') ?? 0,
      woNumber: json['wo_number'] ?? '',
      jobExecutor: json['job_executor'] ?? '',
      trade: json['trade'] ?? '',
      men: int.tryParse(json['men']?.toString() ?? '0') ?? 0,
      hours: double.tryParse(json['hours']?.toString() ?? '0') ?? 0.0,
      forType: json['for'] ?? 'MTC',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_detail_labor': idDetailLabor,
      'wo_number': woNumber,
      'job_executor': jobExecutor,
      'trade': trade,
      'men': men,
      'hours': hours,
      'for': forType,
    };
  }

  Labor copyWith({
    int? idDetailLabor,
    String? woNumber,
    String? jobExecutor,
    String? trade,
    int? men,
    double? hours,
    String? forType,
  }) {
    return Labor(
      idDetailLabor: idDetailLabor ?? this.idDetailLabor,
      woNumber: woNumber ?? this.woNumber,
      jobExecutor: jobExecutor ?? this.jobExecutor,
      trade: trade ?? this.trade,
      men: men ?? this.men,
      hours: hours ?? this.hours,
      forType: forType ?? this.forType,
    );
  }

  double getTotalManHours() {
    return men * hours;
  }
}
