class AssetAfter {
  final String assetCode;
  final String username;
  final String? assetName;

  AssetAfter({
    required this.assetCode,
    required this.username,
    this.assetName,
  });

  factory AssetAfter.fromJson(Map<String, dynamic> json) {
    return AssetAfter(
      assetCode: json['AssetCode'] ?? 'Unknown',
      username: json['Username'] ?? 'No User',
      assetName: json['AssetName'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'AssetCode': assetCode,
      'Username': username,
      'AssetName': assetName,
    };
  }
}