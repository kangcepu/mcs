class StatusSO {
  final int id;
  final String status;

  StatusSO({required this.id, required this.status});

  // factory constructor dari JSON (jika ada)
  factory StatusSO.fromJson(Map<String, dynamic> json) {
    final dynamic rawId = json['id_status'] ?? json['id'] ?? 0;
    final int parsedId =
        rawId is int ? rawId : int.tryParse(rawId.toString()) ?? 0;
    return StatusSO(
      id: parsedId,
      status: (json['status'] ?? '').toString(),
    );
  }

  // method copyWith untuk update sebagian properti
  StatusSO copyWith({
    int? id,
    String? status,
  }) {
    return StatusSO(
      id: id ?? this.id,
      status: status ?? this.status,
    );
  }
}
