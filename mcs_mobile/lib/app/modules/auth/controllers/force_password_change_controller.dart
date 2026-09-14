import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/repositories/auth_repository.dart';
import '../../../core/utils/api_error_helper.dart';
import '../../../core/routes/app_routes.dart';

class ForcePasswordChangeController extends GetxController {
  ForcePasswordChangeController({
    required this.username,
    required this.currentPassword,
    this.message,
  });

  final String username;
  final String currentPassword;
  final String? message;

  final AuthRepository _authRepository = AuthRepository();

  final newPasswordController = TextEditingController();
  final confirmPasswordController = TextEditingController();

  final isLoading = false.obs;
  final isNewPasswordVisible = false.obs;
  final isConfirmPasswordVisible = false.obs;

  @override
  void onClose() {
    newPasswordController.dispose();
    confirmPasswordController.dispose();
    super.onClose();
  }

  void toggleNewPasswordVisibility() {
    isNewPasswordVisible.value = !isNewPasswordVisible.value;
  }

  void toggleConfirmPasswordVisibility() {
    isConfirmPasswordVisible.value = !isConfirmPasswordVisible.value;
  }

  Future<void> submit() async {
    final newPassword = newPasswordController.text.trim();
    final confirmPassword = confirmPasswordController.text.trim();

    if (newPassword.isEmpty || confirmPassword.isEmpty) {
      _showMessage('Password baru dan konfirmasi password wajib diisi.');
      return;
    }

    if (newPassword != confirmPassword) {
      _showMessage('Konfirmasi password tidak cocok.');
      return;
    }

    if (newPassword == currentPassword) {
      _showMessage('Password baru harus berbeda dari password saat ini.');
      return;
    }

    try {
      isLoading.value = true;
      final result = await _authRepository.changePassword(
        username: username,
        currentPassword: currentPassword,
        password: newPassword,
        confirmPassword: confirmPassword,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Berhasil',
          result['message']?.toString() ?? 'Password berhasil diganti.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        Get.offAllNamed(AppRoutes.login);
        return;
      }

      _showMessage(
        result['message']?.toString() ?? 'Gagal mengganti password.',
      );
    } catch (e) {
      _showMessage(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Gagal mengganti password. Silakan coba lagi.',
        ),
      );
    } finally {
      isLoading.value = false;
    }
  }

  void _showMessage(String message) {
    Get.snackbar(
      'Perlu Ganti Password',
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
    );
  }
}
