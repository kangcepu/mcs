import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:open_file/open_file.dart';
import '../models/app_version_model.dart';
import '../repositories/version_repository.dart';

class UpdateProvider extends GetxController {
  final VersionRepository _repository = VersionRepository();

  final isChecking = false.obs;
  final isDownloading = false.obs;
  final updateAvailable = false.obs;
  final downloadProgress = 0.0.obs;
  final Rx<AppVersionModel?> latestVersion = Rx<AppVersionModel?>(null);
  final Rx<String?> currentVersion = Rx<String?>(null);
  int? _currentVersionCode;

  @override
  void onInit() {
    super.onInit();
  }

  Future<void> checkForUpdate() async {
    isChecking.value = true;

    try {
      final packageInfo = await PackageInfo.fromPlatform();
      currentVersion.value = packageInfo.version;
      _currentVersionCode = int.tryParse(packageInfo.buildNumber) ?? 0;

      latestVersion.value = await _repository.getLatestVersion();
      debugPrint('Update check: latest=${latestVersion.value?.version} '
          'code=${latestVersion.value?.versionCode} '
          'url=${latestVersion.value?.downloadUrl}');

      updateAvailable.value =
          latestVersion.value!.versionCode > _currentVersionCode!;
    } catch (e) {
      debugPrint('Error checking for update: $e');
    } finally {
      isChecking.value = false;
    }
  }

  Future<void> downloadAndInstall() async {
    if (latestVersion.value == null) return;
    if (latestVersion.value!.downloadUrl.trim().isEmpty) {
      Get.snackbar(
        'Info',
        'Link update tidak tersedia',
        snackPosition: SnackPosition.BOTTOM,
      );
      return;
    }

    isDownloading.value = true;
    downloadProgress.value = 0.0;

    try {
      if (Platform.isAndroid) {
        final installStatus = await Permission.requestInstallPackages.request();
        if (!installStatus.isGranted) {
          Get.snackbar(
            'Izin Dibutuhkan',
            'Aktifkan "Install unknown apps" untuk MCS Mobile.',
            snackPosition: SnackPosition.BOTTOM,
          );
          await openAppSettings();
          return;
        }
      }

      final directory = await getExternalStorageDirectory();
      if (directory == null) {
        throw Exception('Folder penyimpanan tidak tersedia');
      }
      final savePath = '${directory.path}/app-update.apk';

      final downloadedPath = await _repository.downloadApk(
        latestVersion.value!.downloadUrl,
        savePath,
        (received, total) {
          if (total > 0) {
            downloadProgress.value = received / total;
          }
        },
      );

      final apkFile = File(downloadedPath);
      if (!await apkFile.exists() || await apkFile.length() <= 0) {
        throw Exception('File APK tidak valid setelah download');
      }

      await _installApk(downloadedPath);
    } catch (e) {
      debugPrint('Error downloading/installing update: $e');
      Get.snackbar(
        'Error',
        'Gagal download update: $e',
        snackPosition: SnackPosition.BOTTOM,
      );
    } finally {
      isDownloading.value = false;
    }
  }

  Future<void> _installApk(String filePath) async {
    try {
      final result = await OpenFile.open(
        filePath,
        type: 'application/vnd.android.package-archive',
      );

      if (result.type != ResultType.done) {
        Get.snackbar(
          'Info',
          'Gagal memulai installer otomatis. Silakan install manual dari file APK.',
          snackPosition: SnackPosition.BOTTOM,
        );
      }
    } catch (e) {
      debugPrint('Error installing APK: $e');
      Get.snackbar(
        'Error',
        'Gagal install: $e',
        snackPosition: SnackPosition.BOTTOM,
      );
    }
  }
}
