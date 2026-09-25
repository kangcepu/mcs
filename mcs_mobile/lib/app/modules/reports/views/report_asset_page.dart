import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/routes/app_routes.dart';
import '../controllers/report_asset_controller.dart';

class ReportAssetPage extends StatelessWidget {
  const ReportAssetPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportAssetController());

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: Text(controller.title),
        actions: [
          Obx(() {
            final count = controller.activeFilterCount;
            return IconButton(
              tooltip: 'Filter',
              onPressed: () => _openFilterSheet(controller),
              icon: Badge(
                isLabelVisible: count > 0,
                label: Text('$count'),
                child: const Icon(Icons.filter_list),
              ),
            );
          }),
          Obx(
            () => controller.isExporting.value
                ? const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14),
                    child: Center(
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  )
                : PopupMenuButton<String>(
                    tooltip: 'Export',
                    icon: const Icon(Icons.file_download_outlined),
                    onSelected: controller.export,
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'xlsx', child: Text('Export Excel')),
                      PopupMenuItem(value: 'pdf', child: Text('Export PDF')),
                    ],
                  ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
            child: Column(
              children: [
                Obx(
                  () => Row(
                    children: [
                      Expanded(
                        child: _KpiTile(
                          label: 'Total',
                          value: controller.total.value,
                          color: const Color(0xFF2563EB),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: _KpiTile(
                          label: 'Aktif',
                          value: controller.activeCount.value,
                          color: const Color(0xFF16A34A),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: _KpiTile(
                          label: 'Nonaktif',
                          value: (controller.total.value -
                                  controller.activeCount.value)
                              .clamp(0, 1 << 30),
                          color: const Color(0xFF6B7280),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  height: 40,
                  child: TextField(
                    controller: controller.searchController,
                    onChanged: controller.onSearchChanged,
                    style: const TextStyle(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Cari kode, nama, alias, brand, lokasi…',
                      hintStyle: const TextStyle(fontSize: 13),
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 8),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Obx(() {
            final chips = <String>[
              if (controller.company.value.isNotEmpty) controller.company.value,
              if (controller.location.value.isNotEmpty)
                controller.location.value,
              if (controller.category.value.isNotEmpty)
                controller.category.value,
              if (controller.status.value.isNotEmpty)
                controller.status.value == 'active' ? 'Aktif' : 'Nonaktif',
            ];
            return _ActiveFilterChips(chips: chips);
          }),
          Expanded(
            child: Obx(() {
              if (controller.isLoading.value && controller.items.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }
              if (controller.errorMessage.value != null) {
                return _MessageView(
                  icon: Icons.error_outline,
                  text: controller.errorMessage.value!,
                  actionLabel: 'Coba lagi',
                  onAction: controller.reload,
                );
              }
              if (controller.items.isEmpty) {
                return RefreshIndicator(
                  onRefresh: controller.reload,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 120),
                      Center(
                        child: Text(
                          'Data asset tidak ditemukan',
                          style: TextStyle(color: Color(0xFF6B7280)),
                        ),
                      ),
                    ],
                  ),
                );
              }
              return RefreshIndicator(
                onRefresh: controller.reload,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final width = constraints.maxWidth;
                    final columns = width >= 1000
                        ? 3
                        : width >= 620
                            ? 2
                            : 1;
                    final count = controller.items.length;
                    Widget footer() => Obx(
                          () => Padding(
                            padding: const EdgeInsets.all(8),
                            child: Center(
                              child: controller.isLoadingMore.value
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(
                                      '${controller.items.length} dari ${controller.total.value} asset',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: Color(0xFF9CA3AF),
                                      ),
                                    ),
                            ),
                          ),
                        );
                    return CustomScrollView(
                      controller: controller.scrollController,
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(10, 2, 10, 0),
                          sliver: SliverGrid(
                            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: columns,
                              crossAxisSpacing: 8,
                              mainAxisSpacing: 6,
                              mainAxisExtent: 100,
                            ),
                            delegate: SliverChildBuilderDelegate(
                              (context, index) => _AssetCard(
                                row: controller.items[index],
                                controller: controller,
                              ),
                              childCount: count,
                            ),
                          ),
                        ),
                        SliverToBoxAdapter(child: footer()),
                      ],
                    );
                  },
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  void _openFilterSheet(ReportAssetController controller) {
    final company = controller.company.value.obs;
    final location = controller.location.value.obs;
    final category = controller.category.value.obs;
    final status = controller.status.value.obs;

    Widget dropdown(
      String label,
      RxString selected,
      List<AssetFilterOption> options,
    ) {
      return Obx(() {
        final known = options.any((o) => o.value == selected.value);
        return DropdownButtonFormField<String>(
          initialValue: known ? selected.value : '',
          isExpanded: true,
          isDense: true,
          decoration: InputDecoration(
            labelText: label,
            labelStyle: const TextStyle(fontSize: 12),
            isDense: true,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
          style: const TextStyle(fontSize: 13, color: Color(0xFF111827)),
          items: [
            DropdownMenuItem(value: '', child: Text('Semua $label')),
            ...options.map(
              (o) => DropdownMenuItem(
                value: o.value,
                child: Text(o.label, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
          onChanged: (v) => selected.value = v ?? '',
        );
      });
    }

    Get.bottomSheet(
      SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Filter',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                dropdown('Company', company, controller.companyOptions),
                const SizedBox(height: 8),
                dropdown('Lokasi', location, controller.locationOptions),
                const SizedBox(height: 8),
                dropdown('Kategori', category, controller.categoryOptions),
                const SizedBox(height: 8),
                Obx(
                  () => Wrap(
                    spacing: 6,
                    children: [
                      for (final entry in const {
                        '': 'Semua Status',
                        'active': 'Aktif',
                        'inactive': 'Nonaktif',
                      }.entries)
                        ChoiceChip(
                          label: Text(
                            entry.value,
                            style: const TextStyle(fontSize: 12),
                          ),
                          visualDensity: VisualDensity.compact,
                          selected: status.value == entry.key,
                          onSelected: (_) => status.value = entry.key,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          controller.resetFilters();
                          Get.back();
                        },
                        child: const Text('Reset'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          controller.applyFilters(
                            company: company.value,
                            location: location.value,
                            category: category.value,
                            status: status.value,
                          );
                          Get.back();
                        },
                        child: const Text('Terapkan'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      isScrollControlled: true,
    );
  }
}

class _ActiveFilterChips extends StatelessWidget {
  final List<String> chips;

  const _ActiveFilterChips({required this.chips});

  @override
  Widget build(BuildContext context) {
    if (chips.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 30,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        itemCount: chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) => Chip(
          label: Text(chips[i], style: const TextStyle(fontSize: 11)),
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          backgroundColor: const Color(0xFFEAF2FF),
          side: BorderSide.none,
        ),
      ),
    );
  }
}

class _KpiTile extends StatelessWidget {
  final String label;
  final int value;
  final Color color;

  const _KpiTile({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
          ),
          Text(
            '$value',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _AssetCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final ReportAssetController controller;

  const _AssetCard({required this.row, required this.controller});

  @override
  Widget build(BuildContext context) {
    final name = controller.read(row, const ['AssetName']);
    final alias = controller.read(row, const ['AliasName']);
    final code = controller.read(row, const ['AssetCode']);
    final company = controller.read(row, const ['CompanyName']);
    final location = controller.read(row, const ['LocationAsset']);
    final category = controller.read(row, const ['CategoryAsset']);
    final brand = controller.read(row, const ['brand']);
    final remark = controller.read(row, const ['Keterangan']);
    final active = controller.isActive(row);
    final meta = [company, location, category]
        .where((v) => v.isNotEmpty)
        .join(' • ');

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => Get.toNamed(
          AppRoutes.reportAssetDetail,
          arguments: {'row': row},
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      name.isEmpty ? '-' : name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF111827),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: active
                          ? const Color(0xFFDCFCE7)
                          : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      active ? 'Aktif' : 'Nonaktif',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: active
                            ? const Color(0xFF15803D)
                            : const Color(0xFF6B7280),
                      ),
                    ),
                  ),
                ],
              ),
              Text(
                [code, alias].where((v) => v.isNotEmpty).join('  ·  '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF2563EB),
                ),
              ),
              if (meta.isNotEmpty)
                Text(
                  meta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: Color(0xFF4B5563)),
                ),
              if (brand.isNotEmpty || remark.isNotEmpty)
                Text(
                  [brand, remark].where((v) => v.isNotEmpty).join(' — '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MessageView extends StatelessWidget {
  final IconData icon;
  final String text;
  final String actionLabel;
  final VoidCallback onAction;

  const _MessageView({
    required this.icon,
    required this.text,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 36, color: const Color(0xFF9CA3AF)),
            const SizedBox(height: 8),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Color(0xFF4B5563)),
            ),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: onAction, child: Text(actionLabel)),
          ],
        ),
      ),
    );
  }
}
