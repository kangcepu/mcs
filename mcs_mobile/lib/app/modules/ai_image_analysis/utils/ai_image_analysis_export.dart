import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

import '../../../data/providers/api_service.dart';

Future<void> exportAiImageAnalysis(
    int id, String analysisNumber, String format) async {
  final response = await ApiService().get(
    '/v2/ai-image-analysis/$id/export',
    queryParameters: {'format': format},
    options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(minutes: 2)),
  );
  final raw = response.data;
  final bytes =
      raw is Uint8List ? raw : Uint8List.fromList(List<int>.from(raw as List));
  final safeNumber = analysisNumber.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '-');
  final directory = await getTemporaryDirectory();
  final file = File('${directory.path}/AI-Analysis-$safeNumber.$format');
  await file.writeAsBytes(bytes, flush: true);
  await OpenFile.open(file.path);
}
