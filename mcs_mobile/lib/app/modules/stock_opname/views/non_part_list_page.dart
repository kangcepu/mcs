import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/api_constants.dart';
import '../../../data/models/non_part_model.dart';
import '../../../data/repositories/stock_opname_input_repository.dart';
import '../controllers/non_part_controller.dart';

class NonPartListPage extends StatefulWidget {
  const NonPartListPage({Key? key}) : super(key: key);

  @override
  State<NonPartListPage> createState() => _NonPartListPageState();
}

class _NonPartListPageState extends State<NonPartListPage> {
  final NonPartController controller = Get.find<NonPartController>();
  final StockOpnameInputRepository helperRepository =
      StockOpnameInputRepository();

  late final String noSO;
  late final bool isLocked;

  @override
  void initState() {
    super.initState();
    final args = Get.arguments as Map<String, dynamic>? ?? <String, dynamic>{};
    noSO = (args['noSO'] ?? '').toString();
    isLocked = args['isLocked'] as bool? ?? false;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.fetchNonPartItems(noSO);
    });
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
                title: Text('Part Temuan ($noSO)'),
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
              onPressed: () => controller.fetchNonPartItems(noSO),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => controller.fetchNonPartItems(noSO),
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
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: isSelected ? Colors.blue.shade50 : Colors.white,
              elevation: 3,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          '${index + 1}.',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            item.nonPartName,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 16),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const Icon(Icons.edit, color: Colors.grey),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.format_list_numbered,
                            size: 16, color: Colors.grey),
                        const SizedBox(width: 6),
                        Text('Qty: ${item.qty}',
                            style: const TextStyle(fontSize: 14)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.note, size: 16, color: Colors.grey),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            item.remark?.isNotEmpty == true
                                ? item.remark!
                                : '-',
                            style: TextStyle(
                                fontSize: 14, color: Colors.grey[800]),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _openFormDialog({NonPart? existing}) async {
    final result = await Get.dialog<bool>(
      _NonPartFormDialog(
        noSO: noSO,
        existing: existing,
        controller: controller,
        helperRepository: helperRepository,
      ),
    );

    if (result == true) {
      await controller.fetchNonPartItems(noSO);
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

class _NonPartFormDialog extends StatefulWidget {
  final String noSO;
  final NonPart? existing;
  final NonPartController controller;
  final StockOpnameInputRepository helperRepository;

  const _NonPartFormDialog({
    required this.noSO,
    required this.existing,
    required this.controller,
    required this.helperRepository,
  });

  @override
  State<_NonPartFormDialog> createState() => _NonPartFormDialogState();
}

class _NonPartFormDialogState extends State<_NonPartFormDialog> {
  late final TextEditingController nameController;
  late final TextEditingController qtyController;
  late final TextEditingController remarkController;
  File? selectedImage;

  @override
  void initState() {
    super.initState();
    nameController =
        TextEditingController(text: widget.existing?.nonPartName ?? '');
    qtyController =
        TextEditingController(text: widget.existing?.qty.toString() ?? '');
    remarkController =
        TextEditingController(text: widget.existing?.remark ?? '');
  }

  @override
  void dispose() {
    nameController.dispose();
    qtyController.dispose();
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
        qtyController.text.trim().isEmpty ||
        remarkController.text.trim().isEmpty) {
      Get.snackbar('Error', 'Nama, qty, dan remark wajib diisi',
          snackPosition: SnackPosition.BOTTOM);
      return;
    }

    final qty = int.tryParse(qtyController.text.trim()) ?? 0;
    if (qty <= 0) {
      Get.snackbar('Error', 'Qty harus lebih dari 0',
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
        if (imageName.trim().isEmpty) {
          Get.snackbar('Error', 'Nama file foto tidak terbaca dari server');
          return;
        }
      }
    }

    bool ok;
    if (widget.existing == null) {
      ok = await widget.controller.addNonPart(
        noSO: widget.noSO,
        nonPartName: nameController.text.trim(),
        qty: qty,
        remark: remarkController.text.trim(),
        image: imageName,
      );
    } else {
      ok = await widget.controller.updateNonPart(
        idNonPart: widget.existing!.id,
        noSO: widget.noSO,
        nonPartName: nameController.text.trim(),
        qty: qty,
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
                    ? 'Tambah Part Temuan'
                    : 'Edit Part Temuan',
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
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Part Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: qtyController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Qty'),
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
