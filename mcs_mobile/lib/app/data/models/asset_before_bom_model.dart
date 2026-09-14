class AssetBeforeBOMModel {
  final String assetCode;
  final String assetName;
  final String? hasNotBeenPrinted;
  final String? image;
  final String? status;
  final String? username;
  final String companyName;
  final String categoryAsset;
  final String locationAsset;
  final String? filename;
  final int partsCount;
  final int qtyFound;

  AssetBeforeBOMModel({
    required this.assetCode,
    required this.assetName,
    this.hasNotBeenPrinted,
    this.image,
    this.status,
    this.username,
    required this.companyName,
    required this.categoryAsset,
    required this.locationAsset,
    this.filename,
    required this.partsCount,
    required this.qtyFound,
  });

  factory AssetBeforeBOMModel.fromJson(Map<String, dynamic> json) {
    return AssetBeforeBOMModel(
      assetCode: json['AssetCode'] ?? '',
      assetName: json['AssetName'] ?? '',
      hasNotBeenPrinted: json['HasNotBeenPrinted'],
      image: json['Image'],
      status: json['status'],
      username: json['username'],
      companyName: json['CompanyName'] ?? '',
      categoryAsset: json['CategoryAsset'] ?? '',
      locationAsset: json['LocationAsset'] ?? '',
      filename: json['filename'],
      partsCount: json['partsCount'] ?? 0,
      qtyFound: json['qtyFound'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'AssetCode': assetCode,
      'AssetName': assetName,
      'HasNotBeenPrinted': hasNotBeenPrinted,
      'Image': image,
      'status': status,
      'username': username,
      'CompanyName': companyName,
      'CategoryAsset': categoryAsset,
      'LocationAsset': locationAsset,
      'filename': filename,
      'partsCount': partsCount,
      'qtyFound': qtyFound,
    };
  }
}
