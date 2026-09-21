import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_pdfviewer/pdfviewer.dart';

class PdfViewerPage extends StatelessWidget {
  final String title;
  final Uint8List? bytes;
  final File? file;

  const PdfViewerPage({
    super.key,
    required this.title,
    this.bytes,
    this.file,
  }) : assert(bytes != null || file != null);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: bytes != null
          ? SfPdfViewer.memory(bytes!)
          : SfPdfViewer.file(file!),
    );
  }
}
