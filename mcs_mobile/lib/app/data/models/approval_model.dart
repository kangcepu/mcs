class Approval {
  final int id;
  final String woNumber;
  final String fullname;
  final String? avatar;
  final int idDivision;
  final String idPosition;
  final String comment;
  final String createdAt;

  Approval({
    required this.id,
    required this.woNumber,
    required this.fullname,
    this.avatar,
    required this.idDivision,
    required this.idPosition,
    required this.comment,
    required this.createdAt,
  });

  factory Approval.fromJson(Map<String, dynamic> json) {
    return Approval(
      id: int.tryParse(json['id']?.toString() ?? '0') ?? 0,
      woNumber: json['wo_number'] ?? '',
      fullname: json['fullname'] ?? '',
      avatar: json['avatar'],
      idDivision: int.tryParse(json['id_division']?.toString() ?? '0') ?? 0,
      idPosition: json['id_position'] ?? '',
      comment: json['comment'] ?? '',
      createdAt: json['created_at'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'wo_number': woNumber,
      'fullname': fullname,
      'avatar': avatar,
      'id_division': idDivision,
      'id_position': idPosition,
      'comment': comment,
      'created_at': createdAt,
    };
  }

  Approval copyWith({
    int? id,
    String? woNumber,
    String? fullname,
    String? avatar,
    int? idDivision,
    String? idPosition,
    String? comment,
    String? createdAt,
  }) {
    return Approval(
      id: id ?? this.id,
      woNumber: woNumber ?? this.woNumber,
      fullname: fullname ?? this.fullname,
      avatar: avatar ?? this.avatar,
      idDivision: idDivision ?? this.idDivision,
      idPosition: idPosition ?? this.idPosition,
      comment: comment ?? this.comment,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
