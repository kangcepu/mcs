import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/stock_opname_controller.dart';

class StockOpnameListPage extends GetView<StockOpnameController> {
  const StockOpnameListPage({Key? key}) : super(key: key);

  static const Color _primary = Color(0xFF7A1B0C);

  @override
  Widget build(BuildContext context) {
    return Obx(
      () => Scaffold(
        backgroundColor: const Color(0xFFF3EFF8),
        appBar: controller.selectedItems.isNotEmpty
            ? AppBar(
                backgroundColor: _primary,
                title: Text('${controller.selectedItems.length} Dipilih'),
                leading: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: controller.clearSelection,
                ),
                actions: [
                  if (controller.selectedItems.length == 1)
                    IconButton(
                      icon: const Icon(Icons.edit),
                      onPressed: () {
                        final noSO = controller.selectedItems.first;
                        final stockOpname = controller.stockOpnameList
                            .firstWhere((item) => item.noSO == noSO);
                        final route = stockOpname.isBOM
                            ? '/stock_opname/input_bom'
                            : '/stock_opname/input';

                        Get.toNamed(
                          route,
                          arguments: {
                            'noSO': stockOpname.noSO,
                            'tgl': stockOpname.tgl,
                            'companies': stockOpname.companies,
                            'isLocked': stockOpname.isLocked,
                            'lockedDate': stockOpname.lockedDate,
                            'isBOM': stockOpname.isBOM,
                            'locations': stockOpname.locations,
                          },
                        );
                        controller.clearSelection();
                      },
                    ),
                  IconButton(
                    icon: const Icon(Icons.delete),
                    onPressed: () => _confirmDelete(context),
                  ),
                ],
              )
            : AppBar(
                title: Text('Stock Opname List'),
                backgroundColor: _primary,
              ),
        body: _buildBody(),
        floatingActionButton: controller.selectedItems.isNotEmpty
            ? null
            : FloatingActionButton(
                backgroundColor: _primary,
                onPressed: () => Get.toNamed('/stock_opname/input'),
                child: const Icon(Icons.add, color: Colors.white),
              ),
      ),
    );
  }

  Widget _buildBody() {
    if (controller.isLoading.value && controller.stockOpnameList.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (controller.stockOpnameList.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              controller.errorMessage.value.isEmpty
                  ? 'Tidak ada data'
                  : controller.errorMessage.value,
              style: const TextStyle(color: Colors.grey, fontSize: 16),
            ),
            const SizedBox(height: 10),
            ElevatedButton(
              onPressed: controller.fetchStockOpnameList,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
              ),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: controller.fetchStockOpnameList,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
        itemCount: controller.stockOpnameList.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final stockOpname = controller.stockOpnameList[index];
          final isSelected =
              controller.selectedItems.contains(stockOpname.noSO);

          return GestureDetector(
            onLongPress: () => controller.toggleSelection(stockOpname.noSO),
            onTap: () {
              if (controller.selectedItems.isNotEmpty) {
                controller.toggleSelection(stockOpname.noSO);
                return;
              }

              final route = stockOpname.isBOM
                  ? '/stock_opname/input_bom'
                  : '/stock_opname/input';
              Get.toNamed(
                route,
                arguments: {
                  'noSO': stockOpname.noSO,
                  'tgl': stockOpname.tgl,
                  'companies': stockOpname.companies,
                  'isLocked': stockOpname.isLocked,
                  'lockedDate': stockOpname.lockedDate,
                  'isBOM': stockOpname.isBOM,
                  'locations': stockOpname.locations,
                },
              );
            },
            child: Card(
              elevation: 4,
              shadowColor: Colors.black.withValues(alpha: 0.2),
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              color: isSelected ? const Color(0xFFECE7F7) : Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                stockOpname.noSO,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 18,
                                  color: Color(0xFF212121),
                                ),
                              ),
                              if (stockOpname.isBOM) _badge('BOM', Colors.blue),
                              if (stockOpname.isLocked)
                                _badge(
                                  'LOCKED • ${_formatDateId(stockOpname.lockedDate ?? '')}',
                                  Colors.red,
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatDateId(stockOpname.tgl),
                          style: const TextStyle(
                            fontSize: 15,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Divider(height: 1),
                    const SizedBox(height: 12),
                    _infoRow(
                      Icons.business,
                      Colors.blue,
                      stockOpname.companies.join(', '),
                    ),
                    const SizedBox(height: 8),
                    _infoRow(
                      Icons.category,
                      Colors.green,
                      stockOpname.categories.join(', '),
                    ),
                    if (stockOpname.locations.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _infoRow(
                        Icons.location_on,
                        Colors.orange,
                        stockOpname.locations.join(', '),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, Color color, String text) {
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text.trim().isEmpty ? '-' : text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 16, color: Colors.black87),
          ),
        ),
      ],
    );
  }

  String _formatDateId(String input) {
    final raw = input.trim();
    if (raw.isEmpty || raw == 'N/A' || raw == '-') {
      return '-';
    }

    final parsed = _tryParseDate(raw);
    if (parsed == null) {
      return raw;
    }

    const months = <String>[
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];
    return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
  }

  DateTime? _tryParseDate(String input) {
    final normalized = input.split(' ').first.replaceAll('/', '-');
    final ymd = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
    final dmy = RegExp(r'^(\d{2})-(\d{2})-(\d{4})$');

    if (ymd.hasMatch(normalized)) {
      final m = ymd.firstMatch(normalized)!;
      return DateTime.tryParse('${m.group(1)}-${m.group(2)}-${m.group(3)}');
    }

    if (dmy.hasMatch(normalized)) {
      final m = dmy.firstMatch(normalized)!;
      return DateTime.tryParse('${m.group(3)}-${m.group(2)}-${m.group(1)}');
    }

    return DateTime.tryParse(input);
  }

  void _confirmDelete(BuildContext context) {
    Get.dialog(
      AlertDialog(
        title: const Text('Konfirmasi Hapus'),
        content: Text(
          'Apakah Anda yakin ingin menghapus ${controller.selectedItems.length} item?',
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.deleteSelectedStockOpname();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }
}
