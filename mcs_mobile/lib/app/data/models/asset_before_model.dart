class AssetBefore {
  final String assetCode;
  final String? assetName;
  final int hasNotBeenPrinted;
  final String? assetImage;
  final String? statusSO;
  final String? username;
  final String? filename;

  AssetBefore({
    required this.assetCode,
    this.assetName,
    required this.hasNotBeenPrinted,
    this.assetImage,
    this.statusSO,
    this.username,
    this.filename,
  });

  factory AssetBefore.fromJson(Map<String, dynamic> json) {
    return AssetBefore(
      assetCode: json['AssetCode'] ?? 'Unknown',
      assetName: json['AssetName'],
      hasNotBeenPrinted: int.tryParse(json['HasNotBeenPrinted']?.toString() ?? '0') ?? 0,
      assetImage: json['Image'],
      statusSO: json['status'],
      username: json['username']?.toString().toUpperCase(),
      filename: json['filename']?.toString().toUpperCase(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'AssetCode': assetCode,
      'AssetName': assetName,
      'HasNotBeenPrinted': hasNotBeenPrinted,
      'Image': assetImage,
      'status': statusSO,
      'username': username,
      'filename': filename,
    };
  }
}