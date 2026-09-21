import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

class MediaPickerHelper {
  static final ImagePicker _picker = ImagePicker();

  static const int _defaultImageQuality = 40;
  static const double _defaultMaxDimension = 1600;

  static Future<bool> requestCameraPermission() async {
    final cameraStatus = await Permission.camera.request();
    return cameraStatus.isGranted;
  }

  static Future<File?> pickImageFromCamera() async {
    try {
      final hasPermission = await requestCameraPermission();
      if (!hasPermission) return null;

      final XFile? photo = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: _defaultImageQuality,
        maxWidth: _defaultMaxDimension,
        maxHeight: _defaultMaxDimension,
      );

      if (photo == null) return null;
      return File(photo.path);
    } catch (e) {
      return null;
    }
  }

  static Future<File?> pickImageFromGallery() async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: _defaultImageQuality,
        maxWidth: _defaultMaxDimension,
        maxHeight: _defaultMaxDimension,
      );

      if (photo == null) return null;
      return File(photo.path);
    } catch (e) {
      return null;
    }
  }

  static Future<List<File>> pickMultiImageFromGallery() async {
    try {
      final List<XFile> photos = await _picker.pickMultiImage(
        imageQuality: _defaultImageQuality,
        maxWidth: _defaultMaxDimension,
        maxHeight: _defaultMaxDimension,
      );

      if (photos.isEmpty) return <File>[];
      return photos.map((item) => File(item.path)).toList();
    } catch (e) {
      return <File>[];
    }
  }

  static Future<File?> pickVideoFromCamera() async {
    try {
      final hasPermission = await requestCameraPermission();
      if (!hasPermission) return null;

      final XFile? video = await _picker.pickVideo(
        source: ImageSource.camera,
        maxDuration: const Duration(seconds: 60),
      );

      if (video == null) return null;

      final file = File(video.path);
      final fileSize = await file.length();

      if (fileSize > 52428800) {
        return null;
      }

      return file;
    } catch (e) {
      return null;
    }
  }

  static Future<File?> pickVideoFromGallery() async {
    try {
      final XFile? video = await _picker.pickVideo(
        source: ImageSource.gallery,
      );

      if (video == null) return null;

      final file = File(video.path);
      final fileSize = await file.length();

      if (fileSize > 52428800) {
        return null;
      }

      return file;
    } catch (e) {
      return null;
    }
  }

  static Future<File?> compressImage(File file) async {
    try {
      final dir = await getTemporaryDirectory();
      final targetPath =
          '${dir.path}/${DateTime.now().millisecondsSinceEpoch}.jpg';

      final result = await FlutterImageCompress.compressAndGetFile(
        file.absolute.path,
        targetPath,
        quality: _defaultImageQuality,
        minWidth: 1280,
        minHeight: 1280,
      );

      return result != null ? File(result.path) : null;
    } catch (e) {
      return null;
    }
  }

  static String getFileExtension(String path) {
    return path.split('.').last.toLowerCase();
  }

  static bool isImage(String path) {
    final ext = getFileExtension(path);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].contains(ext);
  }

  static bool isVideo(String path) {
    final ext = getFileExtension(path);
    return ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].contains(ext);
  }

  static bool isPdf(String path) {
    return getFileExtension(path) == 'pdf';
  }
}
