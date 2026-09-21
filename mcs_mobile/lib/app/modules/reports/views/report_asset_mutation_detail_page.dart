import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/constants/api_constants.dart';
import '../../../data/repositories/asset_mutation_repository.dart';

class ReportAssetMutationDetailPage extends StatefulWidget {
  const ReportAssetMutationDetailPage({super.key});

  @override
  State<ReportAssetMutationDetailPage> createState() =>
      _ReportAssetMutationDetailPageState();
}

class _ReportAssetMutationDetailPageState
    extends State<ReportAssetMutationDetailPage> {
  final AssetMutationRepository _repository = AssetMutationRepository();

  bool _loading = true;
  bool _approving = false;
  String _docNo = '';
  Map<String, dynamic> _header = <String, dynamic>{};
  List<Map<String, dynamic>> _details = <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _approvals = <Map<String, dynamic>>[];
  bool _canApprove = false;

  @override
  void initState() {
    super.initState();
    final args = Get.arguments;
    if (args is Map && args['doc_no'] != null) {
      _docNo = args['doc_no'].toString();
    }
    _load();
  }

  String _read(Map<String, dynamic> row, List<String> keys,
      {String fallback = '-'}) {
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return fallback;
  }

  Future<void> _load() async {
    if (_docNo.trim().isEmpty) {
      setState(() {
        _loading = false;
      });
      return;
    }

    try {
      final data = await _repository.getRequestDetail(docNo: _docNo);

      if (!mounted) return;
      setState(() {
        _header = data['header'] is Map
            ? Map<String, dynamic>.from(data['header'] as Map)
            : <String, dynamic>{};
        _details = data['details'] is List
            ? List<Map<String, dynamic>>.from(
                (data['details'] as List)
                    .whereType<Map>()
                    .map((e) => Map<String, dynamic>.from(e)),
              )
            : <Map<String, dynamic>>[];
        _approvals = data['approvals'] is List
            ? List<Map<String, dynamic>>.from(
                (data['approvals'] as List)
                    .whereType<Map>()
                    .map((e) => Map<String, dynamic>.from(e)),
              )
            : <Map<String, dynamic>>[];
        final perms = data['permissions'] is Map
            ? Map<String, dynamic>.from(data['permissions'] as Map)
            : <String, dynamic>{};
        _canApprove = perms['can_approve'] == true;
      });
    } catch (e) {
      Get.snackbar(
        'Error',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _approve() async {
    if (_approving || _docNo.trim().isEmpty) return;

    final confirm = await Get.dialog<bool>(
      AlertDialog(
        title: const Text('Approve Mutation'),
        content: const Text('Yakin approve mutation request ini?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(result: false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () => Get.back(result: true),
            child: const Text('Approve'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() {
      _approving = true;
    });

    try {
      final ok = await _repository.approveRequest(_docNo);
      if (ok) {
        Get.snackbar(
          'Success',
          'Mutation request berhasil di-approve',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF16A34A),
          colorText: Colors.white,
        );
        await _load();
        Get.back(result: true);
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      if (mounted) {
        setState(() {
          _approving = false;
        });
      }
    }
  }

  bool _isImage(String fileName) {
    final lower = fileName.toLowerCase();
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.webp');
  }

  void _previewImage(String imageUrl, String title) {
    final resolvedUrl = ApiConstants.mediaUrl(imageUrl);
    if (resolvedUrl.isEmpty) return;
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        child: Stack(
          children: [
            InteractiveViewer(
              child: Image.network(
                resolvedUrl,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 240,
                  child: Center(
                    child: Text('Gagal membuka gambar'),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 8,
              top: 8,
              child: Container(
                color: Colors.black54,
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
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
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final status = _read(_header, const ['status']).toUpperCase();
    final showApprove = _canApprove && status == 'NEED_APPROVED';

    return Scaffold(
      appBar: AppBar(
        title: Text(_docNo.isEmpty ? 'Detail Mutation' : _docNo),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SectionCard(
              title: 'Header',
              children: [
                _LabelRow(
                  label: 'Doc No',
                  value: _read(_header, const ['doc_no']),
                ),
                _LabelRow(
                  label: 'Date',
                  value: _read(_header, const ['date']),
                ),
                _LabelRow(
                  label: 'Location Before',
                  value: _read(_header, const ['location_before']),
                ),
                _LabelRow(
                  label: 'Company Before',
                  value: _read(_header, const ['company_before']),
                ),
                _LabelRow(
                  label: 'Creator',
                  value: _read(_header, const ['creator', 'created_by']),
                ),
                _LabelRow(
                  label: 'Status',
                  value: status,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Detail Items (${_details.length})',
              children: _details.isEmpty
                  ? const [
                      Text(
                        'Belum ada detail item.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF6B7280),
                        ),
                      ),
                    ]
                  : _details.asMap().entries.map((entry) {
                      final idx = entry.key;
                      final row = entry.value;
                      final attachments = row['attachments'] is List
                          ? List<Map<String, dynamic>>.from(
                              (row['attachments'] as List)
                                  .whereType<Map>()
                                  .map((e) => Map<String, dynamic>.from(e)),
                            )
                          : <Map<String, dynamic>>[];

                      return Container(
                        margin: EdgeInsets.only(
                          bottom: idx == _details.length - 1 ? 0 : 10,
                        ),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFE5E7EB)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _read(row, const ['AssetCode', 'assetCode']),
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF1F2937),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _read(row, const ['AssetName', 'assetName']),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF374151),
                              ),
                            ),
                            const SizedBox(height: 8),
                            _LabelRow(
                              label: 'Company After',
                              value: _read(row, const ['company_after']),
                            ),
                            _LabelRow(
                              label: 'Location After',
                              value: _read(row, const ['location_after']),
                            ),
                            _LabelRow(
                              label: 'Purpose',
                              value: _read(row, const ['mutation_purpose']),
                            ),
                            if (attachments.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              const Text(
                                'Attachments',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF374151),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: attachments.map((attachment) {
                                  final fileName = _read(
                                    attachment,
                                    const ['file_name'],
                                    fallback: 'file',
                                  );
                                  final url = _read(
                                    attachment,
                                    const ['url'],
                                    fallback: '',
                                  );
                                  final isImage = _isImage(fileName);
                                  return InkWell(
                                    onTap: isImage
                                        ? () => _previewImage(url, fileName)
                                        : null,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFEFF6FF),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            isImage
                                                ? Icons.image_outlined
                                                : Icons.attach_file,
                                            size: 14,
                                            color: const Color(0xFF1D4ED8),
                                          ),
                                          const SizedBox(width: 4),
                                          ConstrainedBox(
                                            constraints: const BoxConstraints(
                                              maxWidth: 180,
                                            ),
                                            child: Text(
                                              fileName,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: Color(0xFF1D4ED8),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ],
                          ],
                        ),
                      );
                    }).toList(),
            ),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Approval (${_approvals.length})',
              children: _approvals.isEmpty
                  ? const [
                      Text(
                        'Belum ada approval.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF6B7280),
                        ),
                      ),
                    ]
                  : _approvals.map((row) {
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFE5E7EB)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _read(row, const ['fullname']),
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF111827),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${_read(row, const [
                                    'division_name'
                                  ])} - ${_read(row, const ['id_position'])}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF6B7280),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _read(row, const ['approved_at']),
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF6B7280),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
            ),
            if (showApprove) ...[
              const SizedBox(height: 16),
              SizedBox(
                height: 44,
                child: ElevatedButton.icon(
                  onPressed: _approving ? null : _approve,
                  icon: _approving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(_approving ? 'Approving...' : 'Approve'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({
    required this.title,
    required this.children,
  });

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

  const _LabelRow({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(
            fontSize: 12,
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
