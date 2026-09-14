import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/models/asset_bom_model.dart';
import '../controllers/stock_opname_input_bom_controller.dart';

class StockOpnameInputBOMPage extends StatefulWidget {
  const StockOpnameInputBOMPage({Key? key}) : super(key: key);

  @override
  State<StockOpnameInputBOMPage> createState() =>
      _StockOpnameInputBOMPageState();
}

class _StockOpnameInputBOMPageState extends State<StockOpnameInputBOMPage> {
  final StockOpnameInputBOMController controller =
      Get.find<StockOpnameInputBOMController>();

  late final String noSO;
  late final String tgl;
  late final List<String> companies;
  late final List<String> locations;
  String? lockedDate;
  bool isLocked = false;

  static const Color _primary = Color(0xFF7A1B0C);

  @override
  void initState() {
    super.initState();
    final args = Get.arguments as Map<String, dynamic>? ?? <String, dynamic>{};
    noSO = (args['noSO'] ?? '').toString();
    tgl = (args['tgl'] ?? '').toString();
    isLocked = args['isLocked'] as bool? ?? false;
    lockedDate = args['lockedDate'] as String?;
    companies = List<String>.from(args['companies'] ?? <String>[]);
    locations = List<String>.from(args['locations'] ?? <String>[]);

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.fetchMasterData();
      await controller.fetchAssetsBefore(noSO);
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final showTwoPane = constraints.maxWidth >= 980;

        return Scaffold(
          backgroundColor: const Color(0xFFF3EFF8),
          appBar: AppBar(
            title: Text(
              '$tgl ($noSO)',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 16),
            ),
            backgroundColor: _primary,
            actions: [
              IconButton(
                icon: Icon(isLocked ? Icons.lock : Icons.lock_open),
                onPressed: isLocked
                    ? null
                    : () {
                        Get.defaultDialog(
                          title: 'Lock Stock Opname',
                          middleText: 'Yakin ingin lock stock opname ini?',
                          textConfirm: 'Lock',
                          textCancel: 'Batal',
                          confirmTextColor: Colors.white,
                          onConfirm: () async {
                            Get.back();
                            await controller.lockStockOpname(noSO);
                            if (mounted) {
                              setState(() {
                                isLocked = true;
                              });
                            }
                          },
                        );
                      },
              ),
            ],
          ),
          body: Column(
            children: [
              _buildFilterBar(),
              Expanded(
                child: showTwoPane ? _buildTwoPane() : _buildTabPane(),
              ),
            ],
          ),
          floatingActionButton: _buildActions(),
        );
      },
    );
  }

  Widget _buildFilterBar() {
    return Material(
      color: Colors.white,
      elevation: 1,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          children: [
            TextButton.icon(
              onPressed: _showFilterSheet,
              icon: const Icon(Icons.filter_list, color: Colors.black87),
              label: const Text(
                'Filters',
                style: TextStyle(color: Colors.black87),
              ),
            ),
            const Spacer(),
            Obx(
              () => Text(
                '${controller.totalAssetsBefore.value} Assets',
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabPane() {
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const Material(
            color: Colors.white,
            child: TabBar(
              labelColor: _primary,
              unselectedLabelColor: Colors.grey,
              indicatorColor: _primary,
              tabs: [
                Tab(text: 'Aset'),
                Tab(text: 'BOM'),
              ],
            ),
          ),
          Expanded(
            child: Builder(
              builder: (tabContext) => TabBarView(
                children: [
                  _buildAssetPane(
                    onAssetSelected: () {
                      final tabController =
                          DefaultTabController.maybeOf(tabContext);
                      if (tabController != null && tabController.index != 1) {
                        tabController.animateTo(1);
                      }
                    },
                  ),
                  _buildBomPane(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTwoPane() {
    return Row(
      children: [
        Expanded(child: _buildAssetPane()),
        const VerticalDivider(width: 1),
        Expanded(child: _buildBomPane()),
      ],
    );
  }

  Widget _buildAssetPane({VoidCallback? onAssetSelected}) {
    return Obx(() {
      if (controller.isLoadingAssets.value && controller.assetsBefore.isEmpty) {
        return const Center(child: CircularProgressIndicator());
      }

      if (controller.assetsBefore.isEmpty) {
        return Center(
          child: Text(
            controller.errorMessage.value.isEmpty
                ? 'Tidak ada asset'
                : controller.errorMessage.value,
          ),
        );
      }

      return Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.assignment, color: Color(0xFFD9822B)),
                const SizedBox(width: 8),
                Text(
                  'Daftar Aset (${controller.totalAssetsBefore.value})',
                  style: const TextStyle(
                    fontSize: 30 / 2,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF2D2D2D),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: NotificationListener<ScrollNotification>(
              onNotification: (notification) {
                if (notification.metrics.pixels >=
                    notification.metrics.maxScrollExtent - 120) {
                  controller.loadMoreAssetsBefore(noSO);
                }
                return false;
              },
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 100),
                itemCount: controller.assetsBefore.length +
                    (controller.hasMoreBefore.value ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= controller.assetsBefore.length) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }

                  final asset = controller.assetsBefore[index];
                  return Card(
                    elevation: 3,
                    shadowColor: Colors.black.withValues(alpha: 0.18),
                    margin: const EdgeInsets.only(bottom: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      leading:
                          const Icon(Icons.inventory_2, color: Colors.blue),
                      title: Text(
                        asset.assetName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                      subtitle: Text(asset.assetCode),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        await controller.fetchBOMParts(noSO, asset.assetCode);
                        onAssetSelected?.call();
                      },
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      );
    });
  }

  Widget _buildBomPane() {
    return Obx(() {
      if (controller.selectedAssetCode.value.isEmpty) {
        return const Center(child: Text('Pilih asset terlebih dahulu'));
      }

      if (controller.isLoadingBOM.value) {
        return const Center(child: CircularProgressIndicator());
      }

      if (controller.bomParts.isEmpty) {
        return const Center(child: Text('Tidak ada part BOM'));
      }

      return Column(
        children: [
          Container(
            margin: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 6,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: _primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.inventory_2, color: _primary),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Daftar Item',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 20 / 1.25,
                        ),
                      ),
                      Text(
                        '${controller.bomParts.length} item',
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: isLocked
                      ? null
                      : () => controller.submitBOM(
                            noSO,
                            controller.selectedAssetCode.value,
                          ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: const Icon(Icons.save),
                  label: const Text('Simpan'),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 100),
              itemCount: controller.bomParts.length,
              itemBuilder: (context, index) {
                return _buildBomItem(controller.bomParts[index]);
              },
            ),
          ),
        ],
      );
    });
  }

  Widget _buildBomItem(AssetBOMItem part, {int level = 0}) {
    if (!part.isParent) {
      return Padding(
        padding: EdgeInsets.only(left: level * 10.0),
        child: _BomPartCard(
          key: ValueKey('part-${part.id}'),
          part: part,
          controller: controller,
          isLocked: isLocked,
        ),
      );
    }

    return Card(
      margin: EdgeInsets.only(left: level * 10.0, bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          leading: const Icon(Icons.folder_outlined, color: Colors.amber),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  part.header.isEmpty ? 'Header' : part.header,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF324560),
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE3E6FA),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${part.parts.length} items',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF4E5E96),
                  ),
                ),
              ),
            ],
          ),
          childrenPadding: const EdgeInsets.only(bottom: 10),
          children: part.parts
              .map((child) => _buildBomItem(child, level: level + 1))
              .toList(),
        ),
      ),
    );
  }

  Widget _buildActions() {
    return FloatingActionButton(
      heroTag: 'bom_action_menu',
      backgroundColor: _primary,
      onPressed: _showActionSheet,
      child: const Icon(Icons.menu, color: Colors.white),
    );
  }

  void _showActionSheet() {
    Get.bottomSheet(
      Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!isLocked)
                ListTile(
                  leading: const Icon(Icons.qr_code_scanner),
                  title: const Text('Scan QR'),
                  onTap: () {
                    Get.back();
                    Get.toNamed('/stock_opname/scan',
                        arguments: {'noSO': noSO});
                  },
                ),
              ListTile(
                leading: const Icon(Icons.category),
                title: const Text('Part Temuan'),
                onTap: () {
                  Get.back();
                  Get.toNamed(
                    '/stock_opname/non_part',
                    arguments: {'noSO': noSO, 'isLocked': isLocked},
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.picture_as_pdf),
                title: const Text('Laporan PDF'),
                onTap: () {
                  Get.back();
                  controller.printReportBOM(
                    noSO: noSO,
                    tanggal: tgl,
                    lockedDate: lockedDate,
                    companies: companies,
                    locations: locations,
                  );
                },
              ),
              if (!isLocked)
                ListTile(
                  leading: const Icon(Icons.lock),
                  title: const Text('Lock SO'),
                  onTap: () {
                    Get.back();
                    Get.defaultDialog(
                      title: 'Lock Stock Opname',
                      middleText: 'Yakin ingin lock stock opname ini?',
                      textConfirm: 'Lock',
                      textCancel: 'Batal',
                      confirmTextColor: Colors.white,
                      onConfirm: () async {
                        Get.back();
                        await controller.lockStockOpname(noSO);
                        if (mounted) {
                          setState(() {
                            isLocked = true;
                          });
                        }
                      },
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showFilterSheet() {
    Get.bottomSheet(
      StatefulBuilder(
        builder: (context, setModalState) {
          return Container(
            height: MediaQuery.of(context).size.height * 0.8,
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Obx(
              () => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Company',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: controller.masterCompanies
                        .map(
                          (item) => FilterChip(
                            label: Text(item.companyName),
                            selected: controller.selectedCompanies
                                .contains(item.companyName),
                            onSelected: (_) {
                              controller.toggleCompanyFilter(item.companyName);
                              setModalState(() {});
                            },
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Category',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: controller.masterCategories
                        .map(
                          (item) => FilterChip(
                            label: Text(item.categoryName),
                            selected: controller.selectedCategories
                                .contains(item.categoryName),
                            onSelected: (_) {
                              controller
                                  .toggleCategoryFilter(item.categoryName);
                              setModalState(() {});
                            },
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Location',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: controller.masterLocations
                            .map(
                              (item) => FilterChip(
                                label: Text(item.locationName),
                                selected: controller.selectedLocations
                                    .contains(item.locationName),
                                onSelected: (_) {
                                  controller
                                      .toggleLocationFilter(item.locationName);
                                  setModalState(() {});
                                },
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            controller.selectedCompanies.clear();
                            controller.selectedCategories.clear();
                            controller.selectedLocations.clear();
                            setModalState(() {});
                          },
                          child: const Text('Clear'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () async {
                            Get.back();
                            await controller.fetchAssetsBefore(noSO);
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _primary,
                          ),
                          child: const Text(
                            'Apply',
                            style: TextStyle(color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
      isScrollControlled: true,
    );
  }
}

class _BomPartCard extends StatefulWidget {
  final AssetBOMItem part;
  final StockOpnameInputBOMController controller;
  final bool isLocked;

  const _BomPartCard({
    Key? key,
    required this.part,
    required this.controller,
    required this.isLocked,
  }) : super(key: key);

  @override
  State<_BomPartCard> createState() => _BomPartCardState();
}

class _BomPartCardState extends State<_BomPartCard> {
  late final TextEditingController _remarkController;
  late int _qtyFound;
  late bool _hasChecked;

  @override
  void initState() {
    super.initState();
    _qtyFound = int.tryParse(widget.part.qtyFound) ?? 0;
    _hasChecked = widget.part.qtyFound.trim().isNotEmpty;
    _remarkController = TextEditingController(text: widget.part.remark);
  }

  @override
  void didUpdateWidget(covariant _BomPartCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.part.id != widget.part.id) {
      _qtyFound = int.tryParse(widget.part.qtyFound) ?? 0;
      _hasChecked = widget.part.qtyFound.trim().isNotEmpty;
      _remarkController.text = widget.part.remark;
    }
  }

  @override
  void dispose() {
    _remarkController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final onHand = int.tryParse(widget.part.qtyOnHand) ?? 0;
    final status = _resolveStatus(_hasChecked, _qtyFound, onHand);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      color: status.background,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(status.icon, color: status.iconColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.part.part,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: status.badgeBackground,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    status.label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: status.badgeText,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Qty Sistem: ${widget.part.qtyOnHand} ${widget.part.uom}',
              style: const TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                const Text('Qty Fisik:', style: TextStyle(fontSize: 16)),
                const SizedBox(width: 10),
                IconButton(
                  onPressed: widget.isLocked
                      ? null
                      : () {
                          setState(() {
                            _hasChecked = true;
                            _qtyFound = _qtyFound > 0 ? _qtyFound - 1 : 0;
                          });
                          _syncValue();
                        },
                  icon: const Icon(Icons.remove, size: 28),
                ),
                SizedBox(
                  width: 44,
                  child: Text(
                    _hasChecked ? _qtyFound.toString() : '-',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: widget.isLocked
                      ? null
                      : () {
                          setState(() {
                            _hasChecked = true;
                            _qtyFound = _qtyFound + 1;
                          });
                          _syncValue();
                        },
                  icon: const Icon(Icons.add, size: 28),
                ),
              ],
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _remarkController,
              enabled: !widget.isLocked,
              maxLines: 2,
              onChanged: (_) => _syncValue(),
              decoration: const InputDecoration(
                hintText: '-',
                prefixIcon: Icon(Icons.note_alt_outlined),
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _syncValue() {
    final qty = _hasChecked ? _qtyFound.toString() : '';
    widget.part.qtyFound = qty;
    widget.part.remark = _remarkController.text;
    widget.controller.updateBOMItem(
      widget.part.id,
      qty,
      _remarkController.text,
    );
  }
}

class _BomStatus {
  final String label;
  final Color background;
  final IconData icon;
  final Color iconColor;
  final Color badgeBackground;
  final Color badgeText;

  const _BomStatus({
    required this.label,
    required this.background,
    required this.icon,
    required this.iconColor,
    required this.badgeBackground,
    required this.badgeText,
  });
}

_BomStatus _resolveStatus(bool hasChecked, int found, int onHand) {
  if (!hasChecked) {
    return const _BomStatus(
      label: 'Belum Dicek',
      background: Color(0xFFF4F4F4),
      icon: Icons.help_outline,
      iconColor: Colors.grey,
      badgeBackground: Color(0xFFE4E4E4),
      badgeText: Color(0xFF606060),
    );
  }

  if (found == onHand) {
    return const _BomStatus(
      label: 'Sesuai',
      background: Color(0xFFEFF8EE),
      icon: Icons.check_circle_outline,
      iconColor: Colors.green,
      badgeBackground: Color(0xFFCCEDD1),
      badgeText: Color(0xFF1B6F2C),
    );
  }

  if (found > onHand) {
    return const _BomStatus(
      label: 'Lebih',
      background: Color(0xFFFFF7EA),
      icon: Icons.add_circle_outline,
      iconColor: Colors.orange,
      badgeBackground: Color(0xFFFFE7C8),
      badgeText: Color(0xFFA45B00),
    );
  }

  return const _BomStatus(
    label: 'Kurang',
    background: Color(0xFFFDEEEE),
    icon: Icons.remove_circle_outline,
    iconColor: Colors.red,
    badgeBackground: Color(0xFFFBD3D3),
    badgeText: Color(0xFF9E2424),
  );
}
