import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/constants/api_constants.dart';
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
    final assetController = Get.put(ReportQrController());
    final bomController = Get.put(ReportBomQrController());

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: _kBg,
        appBar: AppBar(
          title: const Text('Cetak QR'),
          bottom: const TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Color(0xCCFFFFFF),
            indicatorColor: Colors.white,
            indicatorWeight: 3,
            dividerColor: Colors.transparent,
            tabs: [
              Tab(
                  icon: Icon(Icons.precision_manufacturing_outlined),
                  text: 'Assets'),
              Tab(icon: Icon(Icons.handyman_outlined), text: 'BOM / Part'),
            ],
          ),
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1100),
              child: TabBarView(
                children: [
                  _AssetQrTab(controller: assetController),
                  _BomQrTab(controller: bomController),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AssetQrTab extends StatelessWidget {
  final ReportQrController controller;

  const _AssetQrTab({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _QrSearchField(
          controller: controller.searchController,
          query: controller.query,
          hint: 'Cari kode, nama, atau company aset...',
          onChanged: controller.onSearchChanged,
          onClear: controller.clearSearch,
        ),
        Expanded(child: _AssetList(controller: controller)),
      ],
    );
  }
}

class _BomQrTab extends StatelessWidget {
  final ReportBomQrController controller;

  const _BomQrTab({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(10, 10, 10, 0),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF7ED),
            border: Border.all(color: const Color(0xFFFED7AA)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Text(
            'Label NIIMBOT B18 · 50 × 12 mm. Pilih Bagikan ke NIIMBOT, lalu cetak dengan skala 100% dan margin 0.',
            style: TextStyle(fontSize: 12, color: Color(0xFF9A3412)),
          ),
        ),
        _QrSearchField(
          controller: controller.searchController,
          query: controller.query,
          hint: 'Cari nama part, Asset Code, atau company...',
          onChanged: controller.onSearchChanged,
          onClear: controller.clearSearch,
        ),
        Expanded(child: _BomList(controller: controller)),
      ],
    );
  }
}

class _QrSearchField extends StatelessWidget {
  final TextEditingController controller;
  final RxString query;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _QrSearchField({
    required this.controller,
    required this.query,
    required this.hint,
    required this.onChanged,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: const TextStyle(fontSize: 13),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(fontSize: 13),
          isDense: true,
          filled: true,
          fillColor: Colors.white,
          prefixIcon: const Icon(Icons.search, size: 20),
          suffixIcon: Obx(
            () => query.value.isEmpty
                ? const SizedBox.shrink()
                : IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: onClear,
                  ),
          ),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
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
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            final columns = width >= 1000
                ? 3
                : width >= 620
                    ? 2
                    : 1;
            return CustomScrollView(
              controller: controller.scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 2, 12, 6),
                    child: Text(
                      '${controller.assets.length} dari ${controller.total.value} aset',
                      style: const TextStyle(fontSize: 12, color: _kMuted),
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 6,
                      mainAxisExtent: 88,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final row = controller.assets[index];
                        return _AssetCard(
                          row: row,
                          onPrint: () => _openLabel(context, row),
                        );
                      },
                      childCount: controller.assets.length,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: controller.isLoadingMore.value
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 10),
                          child: Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        )
                      : const SizedBox(height: 12),
                ),
              ],
            );
          },
        ),
      );
    });
  }
}

class _BomList extends StatelessWidget {
  final ReportBomQrController controller;

  const _BomList({required this.controller});

  void _openLabel(BuildContext context, Map<String, dynamic> row) {
    final rawId = row['part_id'];
    final partId = rawId is int ? rawId : int.tryParse('$rawId') ?? 0;
    if (partId < 1) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      constraints: const BoxConstraints(maxWidth: 720),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _BomLabelSheet(controller: controller, partId: partId),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (controller.isLoading.value && controller.items.isEmpty) {
        return const Center(child: CircularProgressIndicator());
      }
      if (controller.errorMessage.value.isNotEmpty) {
        return _Notice(
          icon: Icons.error_outline,
          title: 'Gagal memuat BOM / Part',
          message: controller.errorMessage.value,
          onRetry: controller.load,
        );
      }
      if (controller.items.isEmpty) {
        return RefreshIndicator(
          onRefresh: controller.load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: const [
              SizedBox(
                height: 320,
                child: _Notice(
                  icon: Icons.search_off,
                  title: 'BOM / Part tidak ditemukan',
                  message: 'Coba ubah kata kunci pencarian.',
                ),
              ),
            ],
          ),
        );
      }
      return RefreshIndicator(
        onRefresh: controller.load,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth >= 1000
                ? 3
                : constraints.maxWidth >= 620
                    ? 2
                    : 1;
            return CustomScrollView(
              controller: controller.scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 2, 12, 6),
                    child: Text(
                      '${controller.items.length} dari ${controller.total.value} BOM / Part',
                      style: const TextStyle(fontSize: 12, color: _kMuted),
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 6,
                      mainAxisExtent: 104,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final row = controller.items[index];
                        return _BomCard(
                          row: row,
                          onPrint: () => _openLabel(context, row),
                        );
                      },
                      childCount: controller.items.length,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: controller.isLoadingMore.value
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 10),
                          child: Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        )
                      : const SizedBox(height: 12),
                ),
              ],
            );
          },
        ),
      );
    });
  }
}

class _BomCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final VoidCallback onPrint;

  const _BomCard({required this.row, required this.onPrint});

  @override
  Widget build(BuildContext context) {
    final name = ReportBomQrController.read(row, ['part_name', 'header']);
    final code = ReportBomQrController.read(row, ['tool_code']);
    final assetCode = ReportBomQrController.read(row, ['asset_code']);
    final assetName = ReportBomQrController.read(row, ['asset_name']);
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
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      code,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
                    Text(
                      [assetCode, assetName]
                          .where((e) => e.isNotEmpty)
                          .join(' · '),
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
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
                    : () =>
                        widget.controller.copyText(code, 'Kode aset disalin'),
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

class _BomLabelSheet extends StatefulWidget {
  final ReportBomQrController controller;
  final int partId;

  const _BomLabelSheet({required this.controller, required this.partId});

  @override
  State<_BomLabelSheet> createState() => _BomLabelSheetState();
}

class _BomLabelSheetState extends State<_BomLabelSheet> {
  final GlobalKey _boundaryKey = GlobalKey();
  late final ReportQrController _outputController;
  Map<String, dynamic>? _qr;
  String _error = '';
  bool _loading = true;
  bool _saving = false;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _outputController = Get.find<ReportQrController>();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final qr = await widget.controller.fetchQr(widget.partId);
      if (!mounted) return;
      setState(() => _qr = qr);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save(String code) async {
    setState(() => _saving = true);
    await _outputController.saveAndOpenLabel(
      _boundaryKey,
      code,
      pixelRatio: 1,
    );
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _share(String code) async {
    setState(() => _sharing = true);
    await _outputController.shareLabel(
      _boundaryKey,
      code,
      pixelRatio: 1,
    );
    if (mounted) setState(() => _sharing = false);
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
                  'Cetak QR BOM / Part',
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
                message:
                    _error.isEmpty ? 'QR BOM / Part tidak ditemukan.' : _error,
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
    final name = ReportBomQrController.read(qr, ['part_name', 'header']);
    final code = ReportBomQrController.read(qr, ['tool_code']);
    final assetCode = ReportBomQrController.read(qr, ['asset_code']);
    final qrContent =
        ReportBomQrController.read(qr, ['qr_content', 'qr_payload']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
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
                child: _BomQrLabel(
                  name: name,
                  code: code,
                  assetCode: assetCode,
                  qrImage: ReportBomQrController.read(qr, ['qr_image']),
                  qrContent: qrContent,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Ukuran label 50 × 12 mm · skala 100% · margin 0',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: _kMuted),
        ),
        const SizedBox(height: 8),
        FilledButton.icon(
          onPressed: _sharing ? null : () => _share(code),
          icon: _sharing
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.share_outlined, size: 18),
          label: const Text('Bagikan ke NIIMBOT'),
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: _saving ? null : () => _save(code),
          icon: _saving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.image_outlined, size: 18),
          label: const Text('Simpan / Buka Gambar'),
        ),
        const SizedBox(height: 6),
        const Text(
          'Jika NIIMBOT tidak muncul pada daftar aplikasi, simpan gambar lalu impor dari aplikasi NIIMBOT.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11, color: _kMuted),
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

class _BomQrLabel extends StatelessWidget {
  final String name;
  final String code;
  final String assetCode;
  final String qrImage;
  final String qrContent;

  const _BomQrLabel({
    required this.name,
    required this.code,
    required this.assetCode,
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
    // 400 × 96 px setara kurang lebih 50 × 12 mm pada printer 203 dpi.
    return Container(
      width: 400,
      height: 96,
      color: Colors.white,
      padding: const EdgeInsets.all(2),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            height: 92,
            child: bytes != null
                ? Image.memory(
                    bytes,
                    fit: BoxFit.fill,
                    filterQuality: FilterQuality.none,
                    gaplessPlayback: true,
                  )
                : Center(
                    child: Text(
                      qrContent,
                      maxLines: 6,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 7, color: Colors.black),
                    ),
                  ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: DefaultTextStyle(
              style: const TextStyle(color: Colors.black, height: 1.05),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'MCS TOOL / BOM',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                  Text(
                    name.isEmpty ? '-' : name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    code,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    assetCode.isEmpty ? 'Tanpa asset' : assetCode,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10),
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

  Uint8List? _logoBytes() {
    if (!logoUrl.startsWith('data:image/')) return null;
    try {
      return base64Decode(logoUrl.substring(logoUrl.indexOf(',') + 1));
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _qrBytes();
    final logoBytes = _logoBytes();
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
                          child: logoBytes != null
                              ? Image.memory(
                                  logoBytes,
                                  width: 46,
                                  height: 46,
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) =>
                                      const SizedBox(width: 46, height: 46),
                                )
                              : Image.network(
                                  ApiConstants.mediaUrl(logoUrl),
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
