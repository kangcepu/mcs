import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pro_image_editor/pro_image_editor.dart';

import 'media_picker_helper.dart';

class DailyControlImageEditorHelper {
  static Future<File?> pickEditedImageFromCamera() async {
    final file = await MediaPickerHelper.pickImageFromCamera();
    return editImage(file);
  }

  static Future<File?> pickEditedImageFromGallery() async {
    final file = await MediaPickerHelper.pickImageFromGallery();
    return editImage(file);
  }

  static Future<List<File>> pickEditedImagesFromGallery() async {
    final files = await MediaPickerHelper.pickMultiImageFromGallery();
    if (files.isEmpty) {
      return <File>[];
    }

    final editedFiles = <File>[];
    for (final file in files) {
      final edited = await editImage(file);
      if (edited != null) {
        editedFiles.add(edited);
      }
    }

    return editedFiles;
  }

  static Future<File?> editImage(File? file) async {
    if (file == null || !await file.exists()) {
      return null;
    }

    final bytes = await file.readAsBytes();
    return Get.to<File?>(
      () => _DailyControlImageEditorPage(
        initialBytes: bytes,
      ),
      fullscreenDialog: true,
      transition: Transition.cupertino,
    );
  }
}

class _DailyControlImageEditorPage extends StatelessWidget {
  const _DailyControlImageEditorPage({
    required this.initialBytes,
  });

  final Uint8List initialBytes;

  Future<File> _saveEditedImage(Uint8List bytes) async {
    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}/dc_edited_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  @override
  Widget build(BuildContext context) {
    return ProImageEditor.memory(
      initialBytes,
      callbacks: ProImageEditorCallbacks(
        onImageEditingComplete: (Uint8List bytes) async {
          final file = await _saveEditedImage(bytes);
          if (context.mounted) {
            Navigator.of(context).pop(file);
          }
        },
      ),
    );
  }
}
