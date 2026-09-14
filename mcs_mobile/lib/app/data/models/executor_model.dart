class Executor {
  final int id;
  final String woNumber;
  final String jobExecutor;
  final String? jobExplanation;
  final String status;
  final String? createdAt;
  final String? updatedAt;

  Executor({
    required this.id,
    required this.woNumber,
    required this.jobExecutor,
    this.jobExplanation,
    required this.status,
    this.createdAt,
    this.updatedAt,
  });

  factory Executor.fromJson(Map<String, dynamic> json) {
    return Executor(
      id: int.tryParse(json['id']?.toString() ?? '0') ?? 0,
      woNumber: json['wo_number'] ?? '',
      jobExecutor: json['job_executor'] ?? '',
      jobExplanation: json['job_explanation'],
      status: json['status'] ?? '',
      createdAt: json['created_at'],
      updatedAt: json['updated_at'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'wo_number': woNumber,
      'job_executor': jobExecutor,
      'job_explanation': jobExplanation,
      'status': status,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  Executor copyWith({
    int? id,
    String? woNumber,
    String? jobExecutor,
    String? jobExplanation,
    String? status,
    String? createdAt,
    String? updatedAt,
  }) {
    return Executor(
      id: id ?? this.id,
      woNumber: woNumber ?? this.woNumber,
      jobExecutor: jobExecutor ?? this.jobExecutor,
      jobExplanation: jobExplanation ?? this.jobExplanation,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
