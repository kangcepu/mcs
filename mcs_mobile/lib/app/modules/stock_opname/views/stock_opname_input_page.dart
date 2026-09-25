import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../core/utils/app_date_picker_helper.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/api_constants.dart';
import '../../../data/models/asset_before_model.dart';
import '../../../data/models/status_so_model.dart';
import '../controllers/stock_opname_controller.dart';
import '../controllers/stock_opname_input_controller.dart';

class StockOpnameInputPage extends StatefulWidget {
  const StockOpnameInputPage({Key? key}) : super(key: key);

  @override
  State<StockOpnameInputPage> createState() => _StockOpnameInputPageState();
}

class _StockOpnameInputPageState extends State<StockOpnameInputPage> {
  final StockOpnameInputController controller =
      Get.find<StockOpnameInputController>();

  late final String noSO;
  late final String tgl;
  late final List<String> companies;
  late final bool isBOM;
  late final List<String> locations;
  String? lockedDate;
  bool isLocked = false;

  @override
  void initState() {
    super.initState();
    final args = Get.arguments as Map<String, dynamic>?;
    noSO = (args?['noSO'] ?? '').toString();
    tgl = (args?['tgl'] ?? '').toString();
    companies = List<String>.from(args?['companies'] ?? <String>[]);
    isBOM = args?['isBOM'] as bool? ?? false;
    locations = List<String>.from(args?['locations'] ?? <String>[]);
    isLocked = args?['isLocked'] as bool? ?? false;
    lockedDate = args?['lockedDate'] as String?;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.fetchMasterData();
      await controller.fetchStatuses();
      if (noSO.isNotEmpty) {
        await controller.applyFilters(noSO);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (noSO.isEmpty) {
      return StockOpnameCreateForm(controller: controller);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final showTwoPane = constraints.maxWidth >= 980;

        return Scaffold(
          backgroundColor: const Color(0xFFF5F7FA),
          appBar: AppBar(
            title: Text(
              '$tgl ($noSO)',
              style: const TextStyle(fontSize: 14),
            ),
            backgroundColor: const Color(0xFF7a1b0c),
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
          floatingActionButton: isLocked ? null : _buildActions(),
        );
      },
    );
  }

  Widget _buildFilterBar() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          TextButton.icon(
            onPressed: () => _showFilterSheet(),
            icon: const Icon(Icons.filter_list),
            label: const Text('Filters'),
          ),
          const Spacer(),
          Obx(() => Text(
                '${controller.totalCombinedAssets} Assets',
                style: const TextStyle(fontWeight: FontWeight.bold),
              )),
        ],
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
              tabs: [
                Tab(text: 'Before'),
                Tab(text: 'After'),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [
                _buildBeforeList(),
                _buildAfterList(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTwoPane() {
    return Row(
      children: [
        Expanded(child: _buildBeforeList()),
        const VerticalDivider(width: 1),
        Expanded(child: _buildAfterList()),
      ],
    );
  }

  Widget _buildBeforeList() {
    return Obx(() {
      if (controller.isLoadingBefore.value && controller.assetsBefore.isEmpty) {
        return const Center(child: CircularProgressIndicator());
      }

      if (controller.assetsBefore.isEmpty) {
        return Center(
          child: Text(
            controller.errorMessageBefore.value.isEmpty
                ? 'Tidak ada data'
                : controller.errorMessageBefore.value,
          ),
        );
      }

      return NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification.metrics.pixels >=
              notification.metrics.maxScrollExtent - 120) {
            controller.loadMoreBefore(noSO);
          }
          return false;
        },
        child: RefreshIndicator(
          onRefresh: () => controller.fetchAssetsBefore(noSO),
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
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
                child: ListTile(
                  leading: Icon(
                    asset.hasNotBeenPrinted == 1
                        ? Icons.check_circle
                        : Icons.inventory_2,
                    color: asset.hasNotBeenPrinted == 1
                        ? Colors.green
                        : Colors.blue,
                  ),
                  title: Text(asset.assetName ?? '-'),
                  subtitle: Text(asset.assetCode),
                  trailing: asset.hasNotBeenPrinted == 1
                      ? const Icon(Icons.chevron_right)
                      : const Icon(Icons.add_photo_alternate),
                  onTap: () => _openBeforeAssetFlow(asset),
                ),
              );
            },
          ),
        ),
      );
    });
  }

  Widget _buildAfterList() {
    return Obx(() {
      if (controller.isLoadingAfter.value && controller.assetsAfter.isEmpty) {
        return const Center(child: CircularProgressIndicator());
      }

      if (controller.assetsAfter.isEmpty) {
        return Center(
          child: Text(
            controller.errorMessageAfter.value.isEmpty
                ? 'Tidak ada data'
                : controller.errorMessageAfter.value,
          ),
        );
      }

      return NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification.metrics.pixels >=
              notification.metrics.maxScrollExtent - 120) {
            controller.loadMoreAfter(noSO);
          }
          return false;
        },
        child: RefreshIndicator(
          onRefresh: () => controller.fetchAssetsAfter(noSO),
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: controller.assetsAfter.length +
                (controller.hasMoreAfter.value ? 1 : 0),
            itemBuilder: (context, index) {
              if (index >= controller.assetsAfter.length) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              final asset = controller.assetsAfter[index];
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.inventory_2, color: Colors.blue),
                  title: Text(asset.assetName ?? '-'),
                  subtitle:
                      Text('${asset.assetCode}\nScanned by: ${asset.username}'),
                  isThreeLine: true,
                ),
              );
            },
          ),
        ),
      );
    });
  }

  Widget _buildActions() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FloatingActionButton(
          heroTag: 'so_scan',
          backgroundColor: const Color(0xFF7a1b0c),
          onPressed: () {
            Get.toNamed('/stock_opname/scan', arguments: {'noSO': noSO});
          },
          child: const Icon(Icons.qr_code_scanner),
        ),
        const SizedBox(height: 10),
        FloatingActionButton(
          heroTag: 'so_non_asset',
          backgroundColor: Colors.orange,
          onPressed: () {
            Get.toNamed('/stock_opname/non_asset',
                arguments: {'noSO': noSO, 'isLocked': isLocked});
          },
          child: const Icon(Icons.add_box),
        ),
        const SizedBox(height: 10),
        FloatingActionButton(
          heroTag: 'so_non_part',
          backgroundColor: Colors.green,
          onPressed: () {
            Get.toNamed('/stock_opname/non_part',
                arguments: {'noSO': noSO, 'isLocked': isLocked});
          },
          child: const Icon(Icons.category),
        ),
        const SizedBox(height: 10),
        FloatingActionButton(
          heroTag: 'so_menu',
          backgroundColor: const Color(0xFF7a1b0c),
          onPressed: _showMenuSheet,
          child: const Icon(Icons.more_horiz),
        ),
      ],
    );
  }

  void _showMenuSheet() {
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
              ListTile(
                leading: const Icon(Icons.picture_as_pdf),
                title: const Text('Laporan PDF'),
                onTap: () async {
                  Get.back();
                  await controller.printReport(
                    noSO: noSO,
                    tanggal: tgl,
                    lockedDate: lockedDate,
                    companies: companies,
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
                      middleText: 'Yakin ingin lock SO ini?',
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
                  const Text('Company',
                      style: TextStyle(fontWeight: FontWeight.bold)),
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
                  const Text('Category',
                      style: TextStyle(fontWeight: FontWeight.bold)),
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
                  const Text('Location',
                      style: TextStyle(fontWeight: FontWeight.bold)),
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
                            controller.clearFilters();
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
                            await controller.applyFilters(noSO);
                          },
                          style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF7a1b0c)),
                          child: const Text('Apply',
                              style: TextStyle(color: Colors.white)),
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

  void _openBeforeAssetFlow(AssetBefore asset) {
    if (asset.hasNotBeenPrinted == 0) {
      if (isLocked) {
        Get.snackbar(
          'Info',
          'SO sudah di-lock, data tidak bisa diubah',
          snackPosition: SnackPosition.BOTTOM,
        );
        return;
      }

      Get.dialog(
        _AttachmentDialog(
          controller: controller,
          noSO: noSO,
          asset: asset,
          isEdit: false,
          isLocked: isLocked,
        ),
      );
      return;
    }

    Get.dialog(
      _AssetDetailDialog(
        controller: controller,
        noSO: noSO,
        asset: asset,
        isLocked: isLocked,
      ),
    );
  }
}

class _AssetDetailDialog extends StatelessWidget {
  final StockOpnameInputController controller;
  final String noSO;
  final AssetBefore asset;
  final bool isLocked;

  const _AssetDetailDialog({
    required this.controller,
    required this.noSO,
    required this.asset,
    required this.isLocked,
  });

  String _buildMasterImageUrl(String? filename) {
    if (filename == null || filename.isEmpty) {
      return '';
    }
    return ApiConstants.uploadUrl('assets/docs/masterAsset/$filename');
  }

  String _buildSoImageUrl(String? filename) {
    if (filename == null || filename.isEmpty) {
      return '';
    }
    return ApiConstants.viewAssetImg(filename);
  }

  @override
  Widget build(BuildContext context) {
    final beforeUrl = _buildMasterImageUrl(asset.filename);
    final afterUrl = _buildSoImageUrl(asset.assetImage);

    return Dialog(
      child: SizedBox(
        width: MediaQuery.of(context).size.width * 0.9,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Detail Asset',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  IconButton(
                      onPressed: Get.back, icon: const Icon(Icons.close)),
                ],
              ),
              const SizedBox(height: 8),
              Text('Asset Code: ${asset.assetCode}'),
              const SizedBox(height: 4),
              Text('Asset Name: ${asset.assetName ?? '-'}'),
              const SizedBox(height: 4),
              Text('Status: ${asset.statusSO ?? '-'}'),
              const SizedBox(height: 4),
              Text('By: ${asset.username ?? '-'}'),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                      child:
                          _ImagePreview(title: 'Before', imageUrl: beforeUrl)),
                  const SizedBox(width: 8),
                  Expanded(
                      child: _ImagePreview(title: 'After', imageUrl: afterUrl)),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: isLocked
                          ? null
                          : () {
                              Get.back();
                              Get.dialog(
                                _AttachmentDialog(
                                  controller: controller,
                                  noSO: noSO,
                                  asset: asset,
                                  isEdit: true,
                                  isLocked: isLocked,
                                ),
                              );
                            },
                      icon: const Icon(Icons.edit, color: Colors.white),
                      label: const Text('Edit',
                          style: TextStyle(color: Colors.white)),
                      style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: isLocked
                          ? null
                          : () async {
                              final success = await controller.updateAsset(
                                noSO: noSO,
                                assetCode: asset.assetCode,
                                updateData: {
                                  'isUpdateValid': false,
                                  'image': asset.assetImage ?? '',
                                  'idStatus': '',
                                },
                              );
                              if (success) {
                                Get.back();
                              }
                            },
                      icon: const Icon(Icons.delete, color: Colors.white),
                      label: const Text('Delete',
                          style: TextStyle(color: Colors.white)),
                      style:
                          ElevatedButton.styleFrom(backgroundColor: Colors.red),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ImagePreview extends StatelessWidget {
  final String title;
  final String imageUrl;

  const _ImagePreview({required this.title, required this.imageUrl});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 180,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(6),
            child: Text(title,
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: imageUrl.isEmpty
                ? const Center(child: Text('No Image'))
                : Image.network(
                    imageUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) =>
                        const Center(child: Text('No Image')),
                  ),
          ),
        ],
      ),
    );
  }
}

class _AttachmentDialog extends StatefulWidget {
  final StockOpnameInputController controller;
  final String noSO;
  final AssetBefore asset;
  final bool isEdit;
  final bool isLocked;

  const _AttachmentDialog({
    required this.controller,
    required this.noSO,
    required this.asset,
    required this.isEdit,
    required this.isLocked,
  });

  @override
  State<_AttachmentDialog> createState() => _AttachmentDialogState();
}

class _AttachmentDialogState extends State<_AttachmentDialog> {
  File? selectedImage;
  StatusSO? selectedStatus;

  @override
  Widget build(BuildContext context) {
    final beforeUrl = widget.asset.filename == null ||
            widget.asset.filename!.isEmpty
        ? ''
        : ApiConstants.uploadUrl('assets/docs/masterAsset/${widget.asset.filename}');

    final afterUrl = selectedImage != null
        ? selectedImage!.path
        : (widget.asset.assetImage == null || widget.asset.assetImage!.isEmpty)
            ? ''
            : ApiConstants.viewAssetImg(widget.asset.assetImage!);

    return Dialog(
      child: SizedBox(
        width: MediaQuery.of(context).size.width * 0.92,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Obx(
            () => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text('Attachment Details',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    IconButton(
                        onPressed: Get.back, icon: const Icon(Icons.close)),
                  ],
                ),
                Text('Asset: ${widget.asset.assetCode}'),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                        child: _ImagePreview(
                            title: 'Before', imageUrl: beforeUrl)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        height: 180,
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          children: [
                            const Padding(
                              padding: EdgeInsets.all(6),
                              child: Text('After',
                                  style:
                                      TextStyle(fontWeight: FontWeight.bold)),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: widget.isLocked
                                    ? null
                                    : () async {
                                        final picker = ImagePicker();
                                        final picked = await picker.pickImage(
                                            source: ImageSource.camera);
                                        if (picked != null) {
                                          setState(() {
                                            selectedImage = File(picked.path);
                                          });
                                        }
                                      },
                                child: selectedImage != null
                                    ? Image.file(selectedImage!,
                                        fit: BoxFit.contain)
                                    : afterUrl.isEmpty
                                        ? const Center(
                                            child: Text('Tap to capture'))
                                        : Image.network(
                                            afterUrl,
                                            fit: BoxFit.contain,
                                            errorBuilder: (_, __, ___) =>
                                                const Center(
                                                    child: Text('No Image')),
                                          ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<StatusSO>(
                  value: selectedStatus,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: widget.controller.statuses
                      .map((item) => DropdownMenuItem(
                          value: item, child: Text(item.status)))
                      .toList(),
                  onChanged: widget.isLocked
                      ? null
                      : (value) {
                          setState(() {
                            selectedStatus = value;
                          });
                        },
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: widget.isLocked ||
                            widget.controller.isLoadingAction.value
                        ? null
                        : () async {
                            if (selectedStatus == null) {
                              Get.snackbar(
                                  'Error', 'Pilih status terlebih dahulu',
                                  snackPosition: SnackPosition.BOTTOM);
                              return;
                            }

                            String? finalImageName = widget.asset.assetImage;
                            if (selectedImage != null) {
                              if (widget.isEdit &&
                                  widget.asset.assetImage != null &&
                                  widget.asset.assetImage!.isNotEmpty) {
                                final replace =
                                    await widget.controller.replaceImage(
                                  oldImageName: widget.asset.assetImage!,
                                  imagePath: selectedImage!.path,
                                  noSO: widget.noSO,
                                );
                                if (replace['status'] != true) {
                                  Get.snackbar(
                                      'Error',
                                      (replace['message'] ??
                                              'Failed upload image')
                                          .toString());
                                  return;
                                }
                                finalImageName =
                                    (replace['filename'] ?? '').toString();
                              } else {
                                final upload = await widget.controller
                                    .uploadImage(selectedImage!.path,
                                        noSO: widget.noSO);
                                if (upload['status'] != true) {
                                  Get.snackbar(
                                      'Error',
                                      (upload['message'] ??
                                              'Failed upload image')
                                          .toString());
                                  return;
                                }
                                finalImageName =
                                    (upload['filename'] ?? '').toString();
                              }
                            }

                            final success = await widget.controller.updateAsset(
                              noSO: widget.noSO,
                              assetCode: widget.asset.assetCode,
                              updateData: {
                                'isUpdateValid': true,
                                'idStatus': selectedStatus!.id.toString(),
                                'image': finalImageName ?? '',
                              },
                            );

                            if (success) {
                              Get.back();
                            }
                          },
                    style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF7a1b0c)),
                    child: widget.controller.isLoadingAction.value
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Submit',
                            style: TextStyle(color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class StockOpnameCreateForm extends StatefulWidget {
  final StockOpnameInputController controller;

  const StockOpnameCreateForm({Key? key, required this.controller})
      : super(key: key);

  @override
  State<StockOpnameCreateForm> createState() => _StockOpnameCreateFormState();
}

class _StockOpnameCreateFormState extends State<StockOpnameCreateForm> {
  final TextEditingController dateController = TextEditingController();
  bool isBOM = false;

  final Set<String> selectedCompanies = <String>{};
  final Set<String> selectedCategories = <String>{};
  final Set<String> selectedLocations = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => widget.controller.fetchMasterData());
  }

  @override
  void dispose() {
    dateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Header Stock Opname'),
        backgroundColor: const Color(0xFF7a1b0c),
      ),
      body: Obx(
        () => widget.controller.isLoadingMasterData.value
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('No SO',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    const Text('SO.XXXXXXXX'),
                    const SizedBox(height: 16),
                    TextField(
                      controller: dateController,
                      readOnly: true,
                      decoration: const InputDecoration(
                        labelText: 'Tanggal',
                        suffixIcon: Icon(Icons.calendar_today),
                      ),
                      onTap: () async {
                        final date = await AppDatePickerHelper.pickDate(
                          context: context,
                          initialDate: DateTime.now(),
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                        );
                        if (date != null) {
                          dateController.text =
                              '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    const Text('Company',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: widget.controller.masterCompanies
                          .map(
                            (item) => FilterChip(
                              label: Text(item.companyName),
                              selected:
                                  selectedCompanies.contains(item.companyName),
                              onSelected: (_) {
                                setState(() {
                                  if (selectedCompanies
                                      .contains(item.companyName)) {
                                    selectedCompanies.remove(item.companyName);
                                  } else {
                                    selectedCompanies.add(item.companyName);
                                  }
                                });
                              },
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 16),
                    const Text('Category',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: widget.controller.masterCategories
                          .map(
                            (item) => FilterChip(
                              label: Text(item.categoryName),
                              selected: selectedCategories
                                  .contains(item.categoryName),
                              onSelected: (_) {
                                setState(() {
                                  if (selectedCategories
                                      .contains(item.categoryName)) {
                                    selectedCategories
                                        .remove(item.categoryName);
                                  } else {
                                    selectedCategories.add(item.categoryName);
                                  }
                                });
                              },
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 16),
                    const Text('Location',
                        style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: widget.controller.masterLocations
                          .map(
                            (item) => FilterChip(
                              label: Text(item.locationName),
                              selected:
                                  selectedLocations.contains(item.locationName),
                              onSelected: (_) {
                                setState(() {
                                  if (selectedLocations
                                      .contains(item.locationName)) {
                                    selectedLocations.remove(item.locationName);
                                  } else {
                                    selectedLocations.add(item.locationName);
                                  }
                                });
                              },
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 12),
                    CheckboxListTile(
                      value: isBOM,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (value) {
                        setState(() {
                          isBOM = value ?? false;
                        });
                      },
                      title: const Text('BOM Only'),
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: Get.back,
                            child: const Text('Cancel'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () async {
                              if (dateController.text.isEmpty) {
                                Get.snackbar('Error', 'Tanggal wajib diisi',
                                    snackPosition: SnackPosition.BOTTOM);
                                return;
                              }

                              final companyValues = selectedCompanies.isEmpty
                                  ? widget.controller.masterCompanies
                                      .map((e) => e.companyName)
                                      .toList()
                                  : selectedCompanies.toList();
                              final categoryValues = selectedCategories.isEmpty
                                  ? widget.controller.masterCategories
                                      .map((e) => e.categoryName)
                                      .toList()
                                  : selectedCategories.toList();
                              final locationValues = selectedLocations.isEmpty
                                  ? widget.controller.masterLocations
                                      .map((e) => e.locationName)
                                      .toList()
                                  : selectedLocations.toList();

                              final ok =
                                  await widget.controller.createStockOpname(
                                tanggal: dateController.text,
                                companies: companyValues,
                                categories: categoryValues,
                                locations: locationValues,
                                isBOM: isBOM,
                              );

                              if (!ok) {
                                Get.snackbar(
                                    'Error', 'Gagal membuat Stock Opname',
                                    snackPosition: SnackPosition.BOTTOM);
                                return;
                              }

                              if (Get.isRegistered<StockOpnameController>()) {
                                await Get.find<StockOpnameController>()
                                    .fetchStockOpnameList();
                              }

                              Get.back();
                              Get.snackbar(
                                'Success',
                                'Stock Opname berhasil dibuat',
                                snackPosition: SnackPosition.BOTTOM,
                                backgroundColor: Colors.green,
                                colorText: Colors.white,
                              );
                            },
                            style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF7a1b0c)),
                            child: const Text('Submit',
                                style: TextStyle(color: Colors.white)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
