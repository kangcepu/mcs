import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/services/realtime_service.dart';
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/widgets/pdf_viewer_page.dart';
import '../../../core/widgets/video_player_page.dart';
import '../../../data/providers/api_service.dart';
import '../../../data/repositories/master_repository.dart';

class ReportAssetDetailPage extends StatefulWidget {
  const ReportAssetDetailPage({super.key});

  @override
  State<ReportAssetDetailPage> createState() => _ReportAssetDetailPageState();
}

class _ReportAssetDetailPageState extends State<ReportAssetDetailPage> {
  final MasterRepository _repository = MasterRepository();
  final ApiService _apiService = ApiService();

  bool _isLoading = true;
  bool _isDownloading = false;

  Map<String, dynamic> _baseRow = <String, dynamic>{};
  Map<String, dynamic> _asset = <String, dynamic>{};
  List<Map<String, dynamic>> _images = <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _documents = <Map<String, dynamic>>[];

  String _assetCode = '';
  RealtimeSubscription? _realtime;

  @override
  void initState() {
    super.initState();
    _bootstrap();
    _realtime = RealtimeSubscription(
      topics: const ['assets'],
      where: (event) =>
          event.woNumber == null ||
          event.woNumber!.trim().isEmpty ||
          event.woNumber!.trim() == _assetCode,
      onChange: () async {
        if (!mounted || _isLoading || _isDownloading || _assetCode.isEmpty) {
          return;
        }
        await _loadDetail(silent: true);
      },
    );
  }

  @override
  void dispose() {
    _realtime?.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final args = Get.arguments;
    _baseRow = args is Map && args['row'] is Map
        ? Map<String, dynamic>.from(args['row'] as Map)
        : <String, dynamic>{};
    _asset = Map<String, dynamic>.from(_baseRow);
    _assetCode = _readValue(
      const ['AssetCode', 'asset_code', 'tag_number', 'code'],
      source: _baseRow,
      fallback: '',
    );

    if (_assetCode.isEmpty) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
      });
      return;
    }

    await _loadDetail();
  }

  Future<void> _loadDetail({bool silent = false}) async {
    try {
      final result = await _repository.getAssetDetail(assetCode: _assetCode);

      final assetMap = Map<String, dynamic>.from(result)
        ..removeWhere((key, _) =>
            key == 'attachments' || key == 'custom_details' || key == 'parts');

      final images = <Map<String, dynamic>>[];
      final documents = <Map<String, dynamic>>[];
      for (final row in _toMapList(result['attachments'])) {
        final filename = (row['filename'] ?? '').toString().trim();
        if (filename.isEmpty) continue;
        final original = (row['original_filename'] ?? '').toString().trim();
        final baseName = filename.split('/').last;
        final entry = <String, dynamic>{
          ...row,
          'name': original.contains('.') ? original : baseName,
          'url': _attachmentUrl(filename),
        };
        final mime = (row['mime'] ?? '').toString().toLowerCase();
        final ext = filename.contains('.')
            ? filename.split('.').last.toLowerCase()
            : '';
        const imageExts = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'jfif'};
        if (mime.startsWith('image/') || imageExts.contains(ext)) {
          images.add(entry);
        } else {
          documents.add(entry);
        }
      }

      if (!mounted) return;
      setState(() {
        _asset = assetMap.isNotEmpty
            ? {..._baseRow, ...assetMap}
            : Map<String, dynamic>.from(_baseRow);
        _images = images;
        _documents = documents;
      });
    } catch (_) {
      if (!mounted || silent) return;
      setState(() {
        _asset = Map<String, dynamic>.from(_baseRow);
      });
    } finally {
      if (mounted && !silent) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _attachmentUrl(String filename) {
    final path = filename.contains('/')
        ? 'uploads/$filename'
        : 'uploads/assets/docs/masterAsset/$filename';
    return '/${path.split('/').map(Uri.encodeComponent).join('/')}';
  }

  List<Map<String, dynamic>> _toMapList(dynamic raw) {
    if (raw is! List) return <Map<String, dynamic>>[];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  String _readValue(
    List<String> keys, {
    Map<String, dynamic>? source,
    String fallback = '-',
  }) {
    final row = source ?? _asset;
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return fallback;
  }

  String _documentUrl(Map<String, dynamic> row) {
    const keys = ['download_url', 'url', 'file_url'];
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return ApiConstants.mediaUrl(value.toString().trim());
      }
    }
    return '';
  }

  String _documentName(Map<String, dynamic> row) {
    const keys = ['name', 'filename', 'file_name'];
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    final fallback = _documentUrl(row);
    if (fallback.isNotEmpty) {
      final uri = Uri.tryParse(fallback);
      if (uri != null && uri.pathSegments.isNotEmpty) {
        return uri.pathSegments.last;
      }
    }
    return 'document';
  }

  String _sanitizeFilename(String value) {
    final safe = value.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    return safe.isEmpty ? 'document' : safe;
  }

  Future<void> _openDocument(Map<String, dynamic> row) async {
    final url = _documentUrl(row);
    if (url.isEmpty) {
      Get.snackbar(
        'Dokumen',
        'URL dokumen tidak valid',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    try {
      if (mounted) {
        setState(() {
          _isDownloading = true;
        });
      }

      final fileName = _sanitizeFilename(_documentName(row));
      final tempDir = await getTemporaryDirectory();
      final filePath = '${tempDir.path}/$fileName';

      await _apiService.dio.download(url, filePath);
      final file = File(filePath);

      if (MediaPickerHelper.isPdf(fileName)) {
        if (mounted) {
          Get.to(() => PdfViewerPage(title: fileName, file: file));
        }
        return;
      }

      if (MediaPickerHelper.isVideo(fileName)) {
        if (mounted) {
          Get.to(() => VideoPlayerPage(title: fileName, file: file));
        }
        return;
      }

      final result = await OpenFile.open(filePath);
      if (result.type != ResultType.done) {
        Get.snackbar(
          'Dokumen',
          result.message.isNotEmpty ? result.message : 'Gagal membuka dokumen',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.orange,
          colorText: Colors.white,
        );
      }
    } catch (e) {
      Get.snackbar(
        'Dokumen',
        'Gagal membuka dokumen: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      if (mounted) {
        setState(() {
          _isDownloading = false;
        });
      }
    }
  }

  void _openImagePreview(int initialIndex) {
    if (_images.isEmpty) return;

    showDialog<void>(
      context: context,
      builder: (context) => _AssetImagePreviewDialog(
        images: _images,
        initialIndex: initialIndex,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Asset'),
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _SectionCard(
                title: _readValue(
                  const ['AssetName', 'asset_name', 'description', 'name'],
                ),
                children: [
                  _LabelRow(
                    label: 'Asset Code',
                    value: _readValue(
                      const ['AssetCode', 'asset_code', 'tag_number', 'code'],
                    ),
                  ),
                  _LabelRow(
                    label: 'Alias Name',
                    value: _readValue(const ['AliasName', 'alias_name']),
                  ),
                  _LabelRow(
                    label: 'Company',
                    value: _readValue(const [
                      'CompanyName',
                      'Company',
                      'company',
                      'company_name',
                    ]),
                  ),
                  _LabelRow(
                    label: 'Category',
                    value: _readValue(const [
                      'CategoryAsset',
                      'category',
                      'Category',
                      'category_asset',
                    ]),
                  ),
                  _LabelRow(
                    label: 'Location',
                    value: _readValue(const [
                      'LocationAsset',
                      'location',
                      'Location',
                      'location_asset',
                    ]),
                  ),
                  _LabelRow(
                    label: 'Status',
                    value: _readValue(const ['status', 'active']),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Keterangan',
                children: [
                  Text(
                    _readValue(
                      const ['Keterangan', 'Remarks', 'remark', 'remarks'],
                      fallback: '-',
                    ),
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF111827),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Foto Asset',
                children: [
                  if (_images.isEmpty)
                    const Text(
                      'Tidak ada foto.',
                      style: TextStyle(
                        fontSize: 13,
                        color: Color(0xFF6B7280),
                      ),
                    )
                  else
                    GridView.builder(
                      itemCount: _images.length,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                        childAspectRatio: 1,
                      ),
                      itemBuilder: (context, index) {
                        final row = _images[index];
                        final imageUrl = _documentUrl(row);

                        return Material(
                          borderRadius: BorderRadius.circular(10),
                          color: const Color(0xFFF3F4F6),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => _openImagePreview(index),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: imageUrl.isEmpty
                                  ? const Center(
                                      child: Icon(
                                        Icons.broken_image_outlined,
                                        color: Color(0xFF9CA3AF),
                                      ),
                                    )
                                  : Image.network(
                                      imageUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => const Center(
                                        child: Icon(
                                          Icons.broken_image_outlined,
                                          color: Color(0xFF9CA3AF),
                                        ),
                                      ),
                                    ),
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Dokumen Asset',
                children: [
                  if (_documents.isEmpty)
                    const Text(
                      'Tidak ada dokumen.',
                      style: TextStyle(
                        fontSize: 13,
                        color: Color(0xFF6B7280),
                      ),
                    )
                  else
                    ..._documents.map((row) {
                      final fileName = _documentName(row);
                      final category = (row['category_name'] ?? '').toString().trim();

                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFE5E7EB)),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.insert_drive_file_outlined,
                              color: Color(0xFF4B5563),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    fileName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF111827),
                                    ),
                                  ),
                                  if (category.isNotEmpty)
                                    Text(
                                      category,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF6B7280),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: _isDownloading
                                  ? null
                                  : () => _openDocument(row),
                              child: const Text('Buka'),
                            ),
                          ],
                        ),
                      );
                    }),
                ],
              ),
            ],
          ),
          if (_isDownloading)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                color: const Color(0xCC111827),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: const Row(
                  children: [
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(width: 10),
                    Text(
                      'Membuka dokumen...',
                      style: TextStyle(color: Colors.white),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AssetImagePreviewDialog extends StatefulWidget {
  final List<Map<String, dynamic>> images;
  final int initialIndex;

  const _AssetImagePreviewDialog({
    required this.images,
    required this.initialIndex,
  });

  @override
  State<_AssetImagePreviewDialog> createState() =>
      _AssetImagePreviewDialogState();
}

class _AssetImagePreviewDialogState extends State<_AssetImagePreviewDialog> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _controller = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _url(Map<String, dynamic> item) {
    const keys = ['url', 'download_url', 'file_url'];
    for (final key in keys) {
      final value = item[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return ApiConstants.mediaUrl(value.toString().trim());
      }
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(10),
      backgroundColor: Colors.black,
      child: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.images.length,
            onPageChanged: (value) {
              setState(() {
                _index = value;
              });
            },
            itemBuilder: (context, idx) {
              final imageUrl = _url(widget.images[idx]);
              return InteractiveViewer(
                child: Center(
                  child: imageUrl.isEmpty
                      ? const Icon(
                          Icons.broken_image_outlined,
                          color: Colors.white70,
                          size: 48,
                        )
                      : Image.network(
                          imageUrl,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            color: Colors.white70,
                            size: 48,
                          ),
                        ),
                ),
              );
            },
          ),
          Positioned(
            top: 12,
            left: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                '${_index + 1}/${widget.images.length}',
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _LabelRow extends StatelessWidget {
  final String label;
  final String value;

  const _LabelRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(
            fontSize: 13,
            color: Color(0xFF374151),
          ),
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            TextSpan(text: value),
          ],
        ),
      ),
    );
  }
}
