class NotAsset {
  final int id;
  final String noSO;
  final String? image;
  final String? locationCode;
  final String? nonAssetName;
  final String? remark;

  NotAsset({
    required this.id,
    required this.noSO,
    this.image,
    this.locationCode,
    this.nonAssetName,
    this.remark,
  });

  factory NotAsset.fromJson(Map<String, dynamic> json) {
    return NotAsset(
      id: json['non_asset_id'] ?? 0,
      noSO: json['NoSO'] ?? '',
      image: json['image'],
      locationCode: json['location_code'],
      nonAssetName: json['non_asset_name'],
      remark: json['remark'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'non_asset_id': id,
      'NoSO': noSO,
      'image': image,
      'location_code': locationCode,
      'non_asset_name': nonAssetName,
      'remark': remark,
    };
  }
}