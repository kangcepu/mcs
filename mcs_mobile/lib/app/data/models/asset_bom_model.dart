class AssetBOMItem {
  final String id;
  final String idNested;
  final String assetCode;
  final String level;
  final String header;
  final String part;
  final String qtyOnHand;
  final String uom;
  String qtyFound;
  String remark;
  List<AssetBOMItem> parts;

  AssetBOMItem({
    required this.id,
    required this.idNested,
    required this.assetCode,
    required this.level,
    required this.header,
    required this.part,
    required this.qtyOnHand,
    required this.uom,
    this.qtyFound = '',
    this.remark = '',
    this.parts = const [],
  });

  factory AssetBOMItem.fromJson(Map<String, dynamic> json) {
    return AssetBOMItem(
      id: json['id'].toString(),
      idNested: json['id_nested']?.toString() ?? '',
      assetCode: json['AssetCode'] ?? '',
      level: json['level'] ?? '',
      header: json['header'] ?? '',
      part: json['part'] ?? '',
      qtyOnHand: json['qty_on_hand']?.toString() ?? '0',
      uom: json['uom'] ?? '',
      qtyFound: json['qty_found']?.toString() ?? '',
      remark: json['remark']?.toString() ?? '',
      parts: (json['parts'] as List<dynamic>?)
          ?.map((part) => AssetBOMItem.fromJson(part))
          .toList() ?? [],
    );
  }

  bool get isParent => level == 'relationship';
}