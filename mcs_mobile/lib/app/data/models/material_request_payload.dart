class MaterialRequestPayload {
  final String woNumber;
  final List<MaterialRequestItem> materials;

  MaterialRequestPayload({
    required this.woNumber,
    required this.materials,
  });

  Map<String, dynamic> toJson() {
    return {
      'wo_number': woNumber,
      'materials': materials.map((item) => item.toJson()).toList(),
    };
  }
}

class MaterialRequestItem {
  final String level;
  final String part;
  final double materialRequest;
  final String uom;

  MaterialRequestItem({
    required this.level,
    required this.part,
    required this.materialRequest,
    required this.uom,
  });

  Map<String, dynamic> toJson() {
    return {
      'level': level,
      'part': part,
      'material_request': materialRequest,
      'uom': uom,
    };
  }

  factory MaterialRequestItem.fromJson(Map<String, dynamic> json) {
    return MaterialRequestItem(
      level: json['level'] ?? '',
      part: json['part'] ?? '',
      materialRequest: (json['material_request'] ?? 0).toDouble(),
      uom: json['uom'] ?? '',
    );
  }
}
