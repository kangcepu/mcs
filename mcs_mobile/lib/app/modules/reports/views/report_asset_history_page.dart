import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/report_asset_history_controller.dart';

const Color _kBg = Color(0xFFF6F8FB);
const Color _kBorder = Color(0xFFE5E7EB);
const Color _kTitle = Color(0xFF111827);
const Color _kMuted = Color(0xFF6B7280);
const Color _kAccent = Color(0xFF1976D2);

class ReportAssetHistoryPage extends StatelessWidget {
  const ReportAssetHistoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportAssetHistoryController());

    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(title: const Text('Asset History')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Obx(
              () => controller.selected.value == null
                  ? _AssetSearchView(controller: controller)
                  : _HistoryView(controller: controller),
            ),
          ),
        ),
      ),
    );
  }
}

class _AssetSearchView extends StatelessWidget {
  final ReportAssetHistoryController controller;

  const _AssetSearchView({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
          child: TextField(
            controller: controller.searchController,
            onChanged: controller.onSearchChanged,
            autofocus: true,
            style: const TextStyle(fontSize: 13),
            decoration: InputDecoration(
              hintText: 'Ketik nama atau kode aset...',
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
        ),
        Expanded(
          child: Obx(() {
            final short = controller.query.value.length <
                ReportAssetHistoryController.minQueryLength;
            if (short) {
              return const _Notice(
                icon: Icons.manage_search,
                title: 'Belum ada aset dipilih',
                message:
                    'Ketik minimal 2 huruf nama atau kode aset, lalu pilih dari daftar.',
              );
            }
            if (controller.assetsLoading.value && controller.assets.isEmpty) {
              return const Center(child: CircularProgressIndicator());
            }
            if (controller.assetsError.value.isNotEmpty) {
              return _Notice(
                icon: Icons.error_outline,
                title: 'Gagal memuat aset',
                message: controller.assetsError.value,
                onRetry: controller.loadAssets,
              );
            }
            if (controller.assets.isEmpty) {
              return const _Notice(
                icon: Icons.search_off,
                title: 'Aset tidak ditemukan',
                message: 'Coba ubah kata kunci pencarian.',
              );
            }
            return _constrained(RefreshIndicator(
              onRefresh: controller.loadAssets,
              child: ListView.separated(
                controller: controller.assetScroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(10, 2, 10, 12),
                itemCount: controller.assets.length + 1,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (context, index) {
                  if (index == controller.assets.length) {
                    return _ListFooter(
                      loading: controller.assetsLoadingMore.value,
                    );
                  }
                  final row = controller.assets[index];
                  return _AssetTile(
                    row: row,
                    onTap: () => controller.selectAsset(row),
                  );
                },
              ),
            ));
          }),
        ),
      ],
    );
  }
}

class _AssetTile extends StatelessWidget {
  final Map<String, dynamic> row;
  final VoidCallback onTap;

  const _AssetTile({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    const read = ReportAssetHistoryController.read;
    final name = read(row, ['AssetName']);
    final code = read(row, ['AssetCode']);
    final sub = [
      read(row, ['CompanyName']),
      read(row, ['LocationAsset']),
    ].where((e) => e.isNotEmpty).join(' · ');
    final inactive = read(row, ['active']).toLowerCase() == 'inactive';

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
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
                      name.isEmpty ? '-' : name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: _kTitle,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      code,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _kAccent,
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
              if (inactive) ...[
                const SizedBox(width: 6),
                const _Chip(label: 'Nonaktif', color: _kMuted),
              ],
              const Icon(Icons.chevron_right, size: 20, color: _kMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _HistoryView extends StatelessWidget {
  final ReportAssetHistoryController controller;

  const _HistoryView({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _SelectedHeader(controller: controller),
        Expanded(
          child: Obx(() {
            if (controller.historyLoading.value && controller.history.isEmpty) {
              return const Center(child: CircularProgressIndicator());
            }
            if (controller.historyError.value.isNotEmpty) {
              return _Notice(
                icon: Icons.error_outline,
                title: 'Gagal memuat riwayat',
                message: controller.historyError.value,
                onRetry: controller.loadHistory,
              );
            }
            if (controller.history.isEmpty) {
              final label = controller.selectedName.isEmpty
                  ? controller.selectedCode
                  : controller.selectedName;
              return RefreshIndicator(
                onRefresh: controller.loadHistory,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    SizedBox(
                      height: 320,
                      child: _Notice(
                        icon: Icons.history_toggle_off,
                        title: 'Tidak ada riwayat',
                        message: 'Tidak ditemukan riwayat untuk aset $label.',
                      ),
                    ),
                  ],
                ),
              );
            }
            return _constrained(RefreshIndicator(
              onRefresh: controller.loadHistory,
              child: ListView.separated(
                controller: controller.historyScroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(10, 2, 10, 12),
                itemCount: controller.history.length + 1,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (context, index) {
                  if (index == controller.history.length) {
                    return _ListFooter(
                      loading: controller.historyLoadingMore.value,
                    );
                  }
                  return _HistoryCard(row: controller.history[index]);
                },
              ),
            ));
          }),
        ),
      ],
    );
  }
}

class _SelectedHeader extends StatelessWidget {
  final ReportAssetHistoryController controller;

  const _SelectedHeader({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 10, 10, 6),
      padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      controller.selectedName.isEmpty
                          ? controller.selectedCode
                          : controller.selectedName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: _kTitle,
                      ),
                    ),
                    Text(
                      controller.selectedCode,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _kAccent,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: controller.clearSelection,
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                child: const Text('Ganti', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Obx(() {
            final busy = controller.exporting.value;
            final enabled = busy.isEmpty && controller.history.isNotEmpty;
            return Row(
              children: [
                Text(
                  '${controller.historyTotal.value} riwayat',
                  style: const TextStyle(fontSize: 12, color: _kMuted),
                ),
                const Spacer(),
                _ExportButton(
                  label: 'Excel',
                  icon: Icons.table_chart_outlined,
                  loading: busy == 'xlsx',
                  onTap: enabled ? () => controller.export('xlsx') : null,
                ),
                const SizedBox(width: 6),
                _ExportButton(
                  label: 'PDF',
                  icon: Icons.picture_as_pdf_outlined,
                  loading: busy == 'pdf',
                  onTap: enabled ? () => controller.export('pdf') : null,
                ),
              ],
            );
          }),
        ],
      ),
    );
  }
}

class _ExportButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool loading;
  final VoidCallback? onTap;

  const _ExportButton({
    required this.label,
    required this.icon,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        visualDensity: VisualDensity.compact,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        minimumSize: const Size(0, 32),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      icon: loading
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(icon, size: 16),
      label: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  final Map<String, dynamic> row;

  const _HistoryCard({required this.row});

  Color _statusColor(String status) {
    final s = status.toUpperCase();
    if (s == 'COMPLETE' || s == 'CLOSED' || s == 'COMPLETE_EXECUTOR') {
      return const Color(0xFF15803D);
    }
    if (s == 'REJECT' || s == 'DECLINE' || s == 'VOID') {
      return const Color(0xFFB91C1C);
    }
    if (s.startsWith('WAIT') || s == 'NEED_CLOSED') {
      return const Color(0xFFB45309);
    }
    if (s.isEmpty) return _kMuted;
    return const Color(0xFF1D4ED8);
  }

  @override
  Widget build(BuildContext context) {
    const read = ReportAssetHistoryController.read;
    final woNumber = read(row, ['wo_number']);
    final status = read(row, ['status']);
    final job = read(row, ['job_title', 'title']);
    final asset = [
      read(row, ['asset_name', 'AssetName']),
      read(row, ['asset_code', 'AssetCode']),
    ].where((e) => e.isNotEmpty).join(' · ');
    final meta = [
      ReportAssetHistoryController.dateText(row['date']),
      read(row, ['type_wo']),
      read(row, ['pic', 'job_executor']),
      read(row, ['company']),
    ].where((e) => e.isNotEmpty && e != '-').join(' · ');

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  woNumber.isEmpty ? '-' : woNumber,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: _kTitle,
                  ),
                ),
              ),
              _Chip(
                label: ReportAssetHistoryController.statusText(status),
                color: _statusColor(status),
              ),
            ],
          ),
          if (job.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              job,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
            ),
          ],
          const SizedBox(height: 3),
          Text(meta, style: const TextStyle(fontSize: 11, color: _kMuted)),
          if (asset.isNotEmpty)
            Text(
              asset,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: _kMuted),
            ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;

  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _ListFooter extends StatelessWidget {
  final bool loading;

  const _ListFooter({required this.loading});

  @override
  Widget build(BuildContext context) {
    if (!loading) return const SizedBox(height: 4);
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
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

Widget _constrained(Widget child) => Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: child,
      ),
    );
