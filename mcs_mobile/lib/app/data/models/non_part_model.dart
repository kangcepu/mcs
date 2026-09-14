class NonPart {
  final int id;
  final String noSO;
  final String? image;
  final String nonPartName;
  final int qty;
  final String? remark;

  NonPart({
    required this.id,
    required this.noSO,
    this.image,
    required this.nonPartName,
    required this.qty,
    this.remark,
  });

  factory NonPart.fromJson(Map<String, dynamic> json) {
    int parseInt(dynamic value) {
      if (value is int) return value;
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }

    return NonPart(
      id: parseInt(json['non_part_id'] ?? json['id'] ?? json['id_non_part']),
      noSO: (json['NoSO'] ?? json['noSO'] ?? json['no_so'] ?? '').toString(),
      image: (json['image'] ?? json['Image'])?.toString(),
      nonPartName: (json['non_part_name'] ??
              json['nonPartName'] ??
              json['NonPartName'] ??
              '')
          .toString(),
      qty: parseInt(json['qty'] ?? json['Qty']),
      remark: (json['remark'] ?? json['Remark'])?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'non_part_id': id,
      'NoSO': noSO,
      'image': image,
      'non_part_name': nonPartName,
      'qty': qty,
      'remark': remark,
    };
  }
}
