import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/api_constants.dart';
import '../../../data/models/location_model.dart';
import '../../../data/models/not_asset_model.dart';
import '../../../data/repositories/stock_opname_input_repository.dart';
import '../controllers/non_asset_controller.dart';

class NonAssetListPage extends StatefulWidget {
  const NonAssetListPage({Key? key}) : super(key: key);

  @override
  State<NonAssetListPage> createState() => _NonAssetListPageState();
}

class _NonAssetListPageState extends State<NonAssetListPage> {
  final NonAssetController controller = Get.find<NonAssetController>();
  final StockOpnameInputRepository helperRepository =
      StockOpnameInputRepository();

  late final String noSO;
  late final bool isLocked;
  List<Location> locations = <Location>[];

  @override
  void initState() {
    super.initState();
    final args = Get.arguments as Map<String, dynamic>? ?? <String, dynamic>{};
    noSO = (args['noSO'] ?? '').toString();
    isLocked = args['isLocked'] as bool? ?? false;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.fetchNonAssetItems(noSO);
      await _loadMasterLocations();
    });
  }

  Future<void> _loadMasterLocations() async {
    final result = await helperRepository.getMasterData();
    if (result['status'] == true) {
      setState(() {
        locations = (result['locations'] as List<Location>?) ?? <Location>[];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Obx(
      () => Scaffold(
        appBar: controller.isSelectionMode.value
            ? AppBar(
                leading: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: controller.clearSelection,
                ),
                title: Text('${controller.selectedIds.length} dipilih'),
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                actions: [
                  IconButton(
                    icon: const Icon(Icons.delete),
                    onPressed: () => _confirmDelete(context),
                  ),
                ],
              )
            : AppBar(
                title: Text('Aset Temuan ($noSO)'),
                backgroundColor: const Color(0xFF7a1b0c),
              ),
        body: _buildBody(),
        floatingActionButton: (controller.isSelectionMode.value || isLocked)
            ? null
            : FloatingActionButton(
                onPressed: () => _openFormDialog(),
                backgroundColor: const Color(0xFF7a1b0c),
                child: const Icon(Icons.add),
              ),
      ),
    );
  }

  Widget _buildBody() {
    if (controller.isLoading.value) {
      return const Center(child: CircularProgressIndicator());
    }

    if (controller.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.list_alt, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            const Text('Tidak ada Data',
                style: TextStyle(fontSize: 16, color: Colors.grey)),
            TextButton(
              onPressed: () => controller.fetchNonAssetItems(noSO),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => controller.fetchNonAssetItems(noSO),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: controller.items.length,
        itemBuilder: (context, index) {
          final item = controller.items[index];
          final isSelected = controller.selectedIds.contains(item.id);

          return GestureDetector(
            onLongPress: () => controller.toggleSelection(item.id),
            onTap: () {
              if (controller.isSelectionMode.value) {
                controller.toggleSelection(item.id);
                return;
              }
              _openFormDialog(existing: item);
            },
            child: Card(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              color: isSelected ? Colors.grey.shade400 : null,
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Row(
                  children: [
                    Text(
                      '${index + 1}. ',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(
                        item.nonAssetName ?? 'No Name',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                    ),
                    Expanded(
                      flex: 4,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8.0),
                        child: Text(
                          item.remark ?? '-',
                          style:
                              TextStyle(fontSize: 14, color: Colors.grey[600]),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                      ),
                    ),
                    const Icon(Icons.edit, color: Colors.grey),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _openFormDialog({NotAsset? existing}) async {
    final result = await Get.dialog<bool>(
      _NonAssetFormDialog(
        noSO: noSO,
        locations: locations,
        existing: existing,
        controller: controller,
        helperRepository: helperRepository,
      ),
    );

    if (result == true) {
      await controller.fetchNonAssetItems(noSO);
    }
  }

  void _confirmDelete(BuildContext context) {
    Get.dialog(
      AlertDialog(
        title: const Text('Konfirmasi Hapus'),
        content: Text(
            'Apakah Anda yakin ingin menghapus ${controller.selectedIds.length} item?'),
        actions: [
          TextButton(
            onPressed: Get.back,
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.deleteSelectedItems(noSO);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }
}

class _NonAssetFormDialog extends StatefulWidget {
  final String noSO;
  final List<Location> locations;
  final NotAsset? existing;
  final NonAssetController controller;
  final StockOpnameInputRepository helperRepository;

  const _NonAssetFormDialog({
    required this.noSO,
    required this.locations,
    required this.existing,
    required this.controller,
    required this.helperRepository,
  });

  @override
  State<_NonAssetFormDialog> createState() => _NonAssetFormDialogState();
}

class _NonAssetFormDialogState extends State<_NonAssetFormDialog> {
  late final TextEditingController nameController;
  late final TextEditingController remarkController;
  String? selectedLocation;
  File? selectedImage;

  @override
  void initState() {
    super.initState();
    nameController =
        TextEditingController(text: widget.existing?.nonAssetName ?? '');
    remarkController =
        TextEditingController(text: widget.existing?.remark ?? '');
    selectedLocation = widget.existing?.locationCode;
  }

  @override
  void dispose() {
    nameController.dispose();
    remarkController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.camera);
    if (picked == null) {
      return;
    }
    setState(() {
      selectedImage = File(picked.path);
    });
  }

  Future<void> _submit() async {
    if (nameController.text.trim().isEmpty ||
        remarkController.text.trim().isEmpty ||
        selectedLocation == null) {
      Get.snackbar('Error', 'Nama, location, dan remark wajib diisi',
          snackPosition: SnackPosition.BOTTOM);
      return;
    }

    String? imageName = widget.existing?.image;
    if (selectedImage != null) {
      if (widget.existing != null &&
          widget.existing!.image != null &&
          widget.existing!.image!.isNotEmpty) {
        final replaced = await widget.helperRepository.replaceImage(
          oldImageName: widget.existing!.image!,
          imagePath: selectedImage!.path,
          noSO: widget.noSO,
        );
        if (replaced['status'] != true) {
          Get.snackbar('Error',
              (replaced['message'] ?? 'Gagal upload gambar').toString());
          return;
        }
        imageName = (replaced['filename'] ?? '').toString();
      } else {
        final uploaded = await widget.helperRepository
            .uploadImage(selectedImage!.path, noSO: widget.noSO);
        if (uploaded['status'] != true) {
          Get.snackbar('Error',
              (uploaded['message'] ?? 'Gagal upload gambar').toString());
          return;
        }
        imageName = (uploaded['filename'] ?? '').toString();
      }
    }

    bool ok;
    if (widget.existing == null) {
      ok = await widget.controller.addNonAsset(
        noSO: widget.noSO,
        nonAssetName: nameController.text.trim(),
        locationCode: selectedLocation!,
        remark: remarkController.text.trim(),
        image: imageName,
      );
    } else {
      ok = await widget.controller.updateNonAsset(
        idNonAsset: widget.existing!.id,
        noSO: widget.noSO,
        nonAssetName: nameController.text.trim(),
        locationCode: selectedLocation!,
        remark: remarkController.text.trim(),
        image: imageName,
      );
    }

    if (ok) {
      Get.back(result: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final imageUrl =
        widget.existing?.image != null && widget.existing!.image!.isNotEmpty
            ? ApiConstants.viewAssetImg(widget.existing!.image!)
            : '';

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.existing == null
                    ? 'Tambah Aset Temuan'
                    : 'Edit Aset Temuan',
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              GestureDetector(
                onTap: _pickImage,
                child: Container(
                  height: 180,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: selectedImage != null
                      ? Image.file(selectedImage!, fit: BoxFit.contain)
                      : imageUrl.isEmpty
                          ? const Center(child: Text('Tap untuk ambil foto'))
                          : Image.network(
                              imageUrl,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) =>
                                  const Center(child: Text('No Image')),
                            ),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: selectedLocation,
                decoration: const InputDecoration(labelText: 'Location'),
                items: widget.locations
                    .map((loc) => DropdownMenuItem(
                        value: loc.locationCode, child: Text(loc.locationName)))
                    .toList(),
                onChanged: (value) => setState(() => selectedLocation = value),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Asset Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: remarkController,
                decoration: const InputDecoration(labelText: 'Remark'),
                maxLines: 2,
              ),
              const SizedBox(height: 14),
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
                      onPressed: _submit,
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
