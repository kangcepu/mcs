import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

import '../constants/api_constants.dart';
import '../../data/providers/api_service.dart';
import '../widgets/pdf_viewer_page.dart';
import '../widgets/video_player_page.dart';
import 'media_picker_helper.dart';

class RemoteFileOpener {
  static Future<void> open(String rawUrl, String fileName) async {
    final url = ApiConstants.mediaUrl(rawUrl);
    if (url.isEmpty) {
      _notify('URL file tidak valid', Colors.red);
      return;
    }

    final safeName = fileName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    final name = safeName.isEmpty ? 'file' : safeName;

    if (MediaPickerHelper.isImage(name) || MediaPickerHelper.isImage(url)) {
      _showImage(url, name);
      return;
    }

    if (MediaPickerHelper.isVideo(name) || MediaPickerHelper.isVideo(url)) {
      Get.to(() => VideoPlayerPage(title: name, networkUrl: url));
      return;
    }

    try {
      final tempDir = await getTemporaryDirectory();
      final filePath = '${tempDir.path}/$name';
      await ApiService().dio.download(url, filePath);
      final file = File(filePath);

      if (MediaPickerHelper.isPdf(name) || MediaPickerHelper.isPdf(url)) {
        Get.to(() => PdfViewerPage(title: name, file: file));
        return;
      }

      final result = await OpenFile.open(filePath);
      if (result.type != ResultType.done) {
        _notify(
          result.message.isNotEmpty ? result.message : 'Gagal membuka file',
          Colors.orange,
        );
      }
    } catch (e) {
      _notify('Gagal membuka file: $e', Colors.red);
    }
  }

  static void _showImage(String url, String title) {
    Get.dialog(
      Dialog(
        child: Stack(
          children: [
            InteractiveViewer(
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 240,
                  child: Center(child: Text('Gagal membuka gambar')),
                ),
              ),
            ),
            Positioned(
              left: 8,
              top: 8,
              child: Container(
                color: Colors.black54,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Text(
                  title,
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ),
            ),
            Positioned(
              right: 8,
              top: 8,
              child: IconButton(
                onPressed: () => Get.back(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static void _notify(String message, Color color) {
    Get.snackbar(
      'File',
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: color,
      colorText: Colors.white,
    );
  }
}
