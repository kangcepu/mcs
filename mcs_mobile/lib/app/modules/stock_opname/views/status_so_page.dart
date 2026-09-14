import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/status_so_controller.dart';

class StatusSoPage extends StatefulWidget {
  const StatusSoPage({Key? key}) : super(key: key);

  @override
  State<StatusSoPage> createState() => _StatusSoPageState();
}

class _StatusSoPageState extends State<StatusSoPage> {
  final StatusSoController controller = Get.find<StatusSoController>();

  @override
  Widget build(BuildContext context) {
    return Obx(
      () => Scaffold(
        appBar: AppBar(
          title: const Text('Status Stock Opname'),
          backgroundColor: const Color(0xFF7a1b0c),
        ),
        floatingActionButton: FloatingActionButton(
          backgroundColor: const Color(0xFF7a1b0c),
          onPressed: () => _showStatusDialog(),
          child: const Icon(Icons.add),
        ),
        body: controller.isLoading.value
            ? const Center(child: CircularProgressIndicator())
            : controller.statuses.isEmpty
                ? Center(
                    child: Text(
                      controller.errorMessage.value.isEmpty
                          ? 'Tidak ada status'
                          : controller.errorMessage.value,
                    ),
                  )
                : ListView.separated(
                    itemCount: controller.statuses.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = controller.statuses[index];
                      return ListTile(
                        leading: CircleAvatar(
                          child: Text('${index + 1}'),
                        ),
                        title: Text(item.status),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit),
                              onPressed: () => _showStatusDialog(
                                  existingId: item.id,
                                  existingValue: item.status),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete),
                              onPressed: () => _confirmDelete(item.id),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
      ),
    );
  }

  Future<void> _showStatusDialog(
      {int? existingId, String? existingValue}) async {
    final textController = TextEditingController(text: existingValue ?? '');
    final saved = await Get.dialog<bool>(
      AlertDialog(
        title: Text(existingId == null ? 'Tambah Status' : 'Edit Status'),
        content: TextField(
          controller: textController,
          decoration: const InputDecoration(labelText: 'Status'),
        ),
        actions: [
          TextButton(onPressed: Get.back, child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              final value = textController.text.trim();
              if (value.isEmpty) {
                return;
              }
              final ok = existingId == null
                  ? await controller.addStatus(value)
                  : await controller.updateStatus(existingId, value);
              if (ok) {
                Get.back(result: true);
              }
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7a1b0c)),
            child: const Text('Simpan', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (saved == true) {
      await controller.fetchStatuses();
    }
  }

  Future<void> _confirmDelete(int id) async {
    final confirmed = await Get.dialog<bool>(
      AlertDialog(
        title: const Text('Hapus Status'),
        content: const Text('Yakin ingin menghapus status ini?'),
        actions: [
          TextButton(
              onPressed: () => Get.back(result: false),
              child: const Text('Batal')),
          TextButton(
              onPressed: () => Get.back(result: true),
              child: const Text('Hapus')),
        ],
      ),
    );

    if (confirmed == true) {
      await controller.deleteStatus(id);
    }
  }
}
