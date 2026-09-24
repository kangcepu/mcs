import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/report_qr_controller.dart';

const Color _kBg = Color(0xFFF6F8FB);
const Color _kBorder = Color(0xFFE5E7EB);
const Color _kTitle = Color(0xFF111827);
const Color _kMuted = Color(0xFF6B7280);
const Color _kAccent = Color(0xFF1976D2);

class ReportQrPage extends StatelessWidget {
  const ReportQrPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportQrController());

    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(title: const Text('Cetak QR')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
                  child: TextField(
                    controller: controller.searchController,
                    onChanged: controller.onSearchChanged,
                    style: const TextStyle(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Cari kode, nama, atau company aset...',
                      hintStyle: const TextStyle(fontSize: 13),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: Obx(
                        () => controller.query.value.isEmpty
                            ? const SizedBox.shrink()
                            : IconButton(
                                icon: const Icon(Icons.close, size: 18),
                                onPressed: controller.clearSearch,
                              ),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 10,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _kBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _kBorder),
                      ),
                    ),
                  ),
                ),
                Expanded(child: _AssetList(controller: controller)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AssetList extends StatelessWidget {
  final ReportQrController controller;

  const _AssetList({required this.controller});

  void _openLabel(BuildContext context, Map<String, dynamic> row) {
    final code = ReportQrController.read(row, ['AssetCode']);
    if (code.isEmpty) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      constraints: const BoxConstraints(maxWidth: 560),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _LabelSheet(controller: controller, assetCode: code),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (controller.isLoading.value && controller.assets.isEmpty) {
        return const Center(child: CircularProgressIndicator());
      }
      if (controller.errorMessage.value.isNotEmpty) {
        return _Notice(
          icon: Icons.error_outline,
          title: 'Gagal memuat aset',
          message: controller.errorMessage.value,
          onRetry: controller.load,
        );
      }
      if (controller.assets.isEmpty) {
        return RefreshIndicator(
          onRefresh: controller.load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: const [
              SizedBox(
                height: 320,
                child: _Notice(
                  icon: Icons.search_off,
                  title: 'Aset tidak ditemukan',
                  message: 'Coba ubah kata kunci pencarian.',
                ),
              ),
            ],
          ),
        );
      }
      return RefreshIndicator(
        onRefresh: controller.load,
        child: ListView.separated(
          controller: controller.scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(10, 2, 10, 12),
          itemCount: controller.assets.length + 2,
          separatorBuilder: (_, __) => const SizedBox(height: 6),
          itemBuilder: (context, index) {
            if (index == 0) {
              return Padding(
                padding: const EdgeInsets.only(left: 2),
                child: Text(
                  '${controller.assets.length} dari ${controller.total.value} aset',
                  style: const TextStyle(fontSize: 12, color: _kMuted),
                ),
              );
            }
            if (index == controller.assets.length + 1) {
              return controller.isLoadingMore.value
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    )
                  : const SizedBox(height: 4);
            }
            final row = controller.assets[index - 1];
            return _AssetCard(
              row: row,
              onPrint: () => _openLabel(context, row),
            );
          },
        ),
      );
    });
  }
}

class _AssetCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final VoidCallback onPrint;

  const _AssetCard({required this.row, required this.onPrint});

  @override
  Widget build(BuildContext context) {
    const read = ReportQrController.read;
    final name = read(row, ['AssetName']);
    final sub = [
      read(row, ['CompanyName']),
      read(row, ['LocationAsset']),
    ].where((e) => e.isNotEmpty).join(' · ');

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onPrint,
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _kBorder),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      read(row, ['AssetCode']),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: _kAccent,
                      ),
                    ),
                    Text(
                      name.isEmpty ? '-' : name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _kTitle,
                      ),
                    ),
                    if (sub.isNotEmpty)
                      Text(
                        sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11, color: _kMuted),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              OutlinedButton.icon(
                onPressed: onPrint,
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  minimumSize: const Size(0, 32),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                icon: const Icon(Icons.qr_code_2, size: 16),
                label: const Text('Cetak QR', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LabelSheet extends StatefulWidget {
  final ReportQrController controller;
  final String assetCode;

  const _LabelSheet({required this.controller, required this.assetCode});

  @override
  State<_LabelSheet> createState() => _LabelSheetState();
}

class _LabelSheetState extends State<_LabelSheet> {
  final GlobalKey _boundaryKey = GlobalKey();
  Map<String, dynamic>? _qr;
  String _error = '';
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final qr = await widget.controller.fetchQr(widget.assetCode);
      if (!mounted) return;
      setState(() => _qr = qr);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await widget.controller.saveAndOpenLabel(_boundaryKey, widget.assetCode);
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final qr = _qr;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Cetak Label QR',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: _kTitle,
                  ),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          if (_loading)
            const SizedBox(
              height: 180,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (qr == null)
            SizedBox(
              height: 200,
              child: _Notice(
                icon: Icons.error_outline,
                title: 'Gagal memuat QR',
                message: _error.isEmpty
                    ? 'QR tidak ditemukan untuk aset ini.'
                    : _error,
                onRetry: _load,
              ),
            )
          else
            Flexible(child: SingleChildScrollView(child: _content(qr))),
        ],
      ),
    );
  }

  Widget _content(Map<String, dynamic> qr) {
    const read = ReportQrController.read;
    final asset = qr['asset'] is Map
        ? Map<String, dynamic>.from(qr['asset'] as Map)
        : <String, dynamic>{};
    final code = read(qr, ['asset_code']).isNotEmpty
        ? read(qr, ['asset_code'])
        : read(asset, ['AssetCode']);
    final name = read(qr, ['asset_name']).isNotEmpty
        ? read(qr, ['asset_name'])
        : read(asset, ['AssetName']);
    final qrContent = read(qr, ['qr_content', 'qr_payload']);
    final printUrl = read(qr, ['print_url', 'qr_url']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: _kBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _kBorder),
          ),
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: RepaintBoundary(
                key: _boundaryKey,
                child: _QrLabel(
                  logoUrl: read(qr, ['logo_url']),
                  name: name,
                  code: code,
                  qrImage: read(qr, ['qr_image']),
                  qrContent: qrContent,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 40),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          icon: _saving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.print_outlined, size: 18),
          label: const Text(
            'Cetak / Simpan Gambar',
            style: TextStyle(fontSize: 13),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: code.isEmpty
                    ? null
                    : () => widget.controller
                        .copyText(code, 'Kode aset disalin'),
                icon: const Icon(Icons.copy, size: 15),
                label: const Text('Salin kode', style: TextStyle(fontSize: 12)),
              ),
            ),
            if (printUrl.isNotEmpty) ...[
              const SizedBox(width: 6),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => widget.controller
                      .copyText(printUrl, 'Tautan cetak disalin'),
                  icon: const Icon(Icons.link, size: 15),
                  label: const Text(
                    'Salin tautan cetak',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ),
            ],
          ],
        ),
        if (qrContent.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            'Isi QR: $qrContent',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: _kMuted),
          ),
        ],
      ],
    );
  }
}

class _QrLabel extends StatelessWidget {
  final String logoUrl;
  final String name;
  final String code;
  final String qrImage;
  final String qrContent;

  const _QrLabel({
    required this.logoUrl,
    required this.name,
    required this.code,
    required this.qrImage,
    required this.qrContent,
  });

  Uint8List? _qrBytes() {
    if (qrImage.isEmpty) return null;
    try {
      final comma = qrImage.indexOf(',');
      return base64Decode(comma >= 0 ? qrImage.substring(comma + 1) : qrImage);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _qrBytes();
    final longName = name.length > 30;

    return Container(
      width: 300,
      height: 150,
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black, width: 1.5),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.black, width: 1),
        ),
        child: DefaultTextStyle(
          style: const TextStyle(color: Colors.black),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'PROPERTY OF',
                      style: TextStyle(fontSize: 11, letterSpacing: 0.4),
                    ),
                    if (logoUrl.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: ClipOval(
                          child: Image.network(
                            logoUrl,
                            width: 46,
                            height: 46,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) =>
                                const SizedBox(width: 46, height: 46),
                          ),
                        ),
                      ),
                    Text(
                      name.isEmpty ? '-' : name,
                      textAlign: TextAlign.center,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: longName ? 10 : 13,
                        fontWeight: FontWeight.w700,
                        height: 1.12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              SizedBox(
                width: 112,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (bytes != null)
                      Image.memory(
                        bytes,
                        width: 100,
                        height: 100,
                        fit: BoxFit.contain,
                        filterQuality: FilterQuality.none,
                        gaplessPlayback: true,
                      )
                    else
                      SizedBox(
                        width: 100,
                        height: 100,
                        child: Text(
                          qrContent.isEmpty ? code : qrContent,
                          style: const TextStyle(fontSize: 8),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 8,
                        ),
                      ),
                    const SizedBox(height: 2),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        code,
                        maxLines: 1,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final VoidCallback? onRetry;

  const _Notice({
    required this.icon,
    required this.title,
    required this.message,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 36, color: const Color(0xFF9CA3AF)),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: _kTitle,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: _kMuted),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Coba lagi', style: TextStyle(fontSize: 12)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
