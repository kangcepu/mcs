import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/force_password_change_controller.dart';

class ForcePasswordChangePage extends StatelessWidget {
  const ForcePasswordChangePage({super.key});

  @override
  Widget build(BuildContext context) {
    final args = (Get.arguments is Map) ? Map<String, dynamic>.from(Get.arguments) : <String, dynamic>{};
    final controller = Get.put(
      ForcePasswordChangeController(
        username: args['username']?.toString() ?? '',
        currentPassword: args['current_password']?.toString() ?? '',
        message: args['message']?.toString(),
      ),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ganti Password'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Password Baru Wajib Diisi',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        controller.message ??
                            'Silakan buat password baru untuk melanjutkan.',
                      ),
                      const SizedBox(height: 24),
                      Obx(
                        () => TextField(
                          controller: controller.newPasswordController,
                          obscureText: !controller.isNewPasswordVisible.value,
                          decoration: InputDecoration(
                            labelText: 'Password Baru',
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(
                              icon: Icon(
                                controller.isNewPasswordVisible.value
                                    ? Icons.visibility
                                    : Icons.visibility_off,
                              ),
                              onPressed:
                                  controller.toggleNewPasswordVisibility,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Obx(
                        () => TextField(
                          controller: controller.confirmPasswordController,
                          obscureText:
                              !controller.isConfirmPasswordVisible.value,
                          decoration: InputDecoration(
                            labelText: 'Konfirmasi Password Baru',
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(
                              icon: Icon(
                                controller.isConfirmPasswordVisible.value
                                    ? Icons.visibility
                                    : Icons.visibility_off,
                              ),
                              onPressed:
                                  controller.toggleConfirmPasswordVisibility,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Obx(
                        () => ElevatedButton(
                          onPressed:
                              controller.isLoading.value ? null : controller.submit,
                          child: controller.isLoading.value
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Simpan Password Baru'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
