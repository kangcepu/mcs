class AppVersionModel {
  final String version;
  final String downloadUrl;
  final String releaseNotes;
  final bool forceUpdate;
  final int versionCode;

  AppVersionModel({
    required this.version,
    required this.downloadUrl,
    required this.releaseNotes,
    required this.forceUpdate,
    required this.versionCode,
  });

  factory AppVersionModel.fromJson(Map<String, dynamic> json) {
    return AppVersionModel(
      version: json['version'] ?? '',
      downloadUrl: json['download_url'] ?? '',
      releaseNotes: json['release_notes'] ?? '',
      forceUpdate: json['force_update'] ?? false,
      versionCode: json['version_code'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'download_url': downloadUrl,
      'release_notes': releaseNotes,
      'force_update': forceUpdate,
      'version_code': versionCode,
    };
  }
}