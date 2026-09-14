import 'package:flutter/material.dart';
import 'package:get/get.dart';

/// One shared executor-to-Sparepart request form for every WO module.
/// The Sparepart user selects the actual ERP part and quantity afterwards.
class RequestPartDialog {
  const RequestPartDialog._();

  static void show({
    required Future<void> Function({String? note}) onRequest,
  }) {
    Get.dialog(
      _RequestPartDialogContent(onRequest: onRequest),
    );
  }
}

class _RequestPartDialogContent extends StatefulWidget {
  const _RequestPartDialogContent({required this.onRequest});

  final Future<void> Function({String? note}) onRequest;

  @override
  State<_RequestPartDialogContent> createState() =>
      _RequestPartDialogContentState();
}

class _RequestPartDialogContentState extends State<_RequestPartDialogContent> {
  final _noteController = TextEditingController();

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Request Part',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            const Text(
              'Tim Material akan memproses part yang Anda butuhkan.',
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _noteController,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Catatan (opsional)',
                hintText: 'Misal: bearing rusak, urgent...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
                fillColor: const Color(0xFFF8FAFC),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Get.back(),
                    child: const Text('Batal'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      final note = _noteController.text.trim();
                      Get.back();
                      widget.onRequest(note: note.isEmpty ? null : note);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2A5298),
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Request'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
