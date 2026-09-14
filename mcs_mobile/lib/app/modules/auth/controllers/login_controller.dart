import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:fluttertoast/fluttertoast.dart';
import '../../../core/routes/app_routes.dart';
import '../../../core/widgets/update_dialog.dart';
import '../../../data/repositories/auth_repository.dart';
import '../../../data/providers/update_provider.dart';
import '../../../core/utils/api_error_helper.dart';

class LoginController extends GetxController {
  final AuthRepository _authRepository = AuthRepository();
  final UpdateProvider _updateProvider = Get.find<UpdateProvider>();

  // Form controllers
  final usernameController = TextEditingController();
  final passwordController = TextEditingController();

  // Observable variables
  final isLoading = false.obs;
  final isPasswordVisible = false.obs;

  @override
  void onClose() {
    usernameController.dispose();
    passwordController.dispose();
    super.onClose();
  }

  /// Toggle password visibility
  void togglePasswordVisibility() {
    isPasswordVisible.value = !isPasswordVisible.value;
  }

  Future<void> initializeLoginPage() async {
    await checkForUpdate();
    await checkAutoLogin();
  }

  Future<void> checkForUpdate() async {
    try {
      await _updateProvider.checkForUpdate();

      if (_updateProvider.updateAvailable.value == true &&
          !(Get.isDialogOpen ?? false)) {
        Get.dialog(
          UpdateDialog(
            forceUpdate:
                _updateProvider.latestVersion.value?.forceUpdate ?? false,
          ),
          barrierDismissible:
              !(_updateProvider.latestVersion.value?.forceUpdate ?? false),
        );
      }
    } catch (e) {
      debugPrint('Error checking for update from login: $e');
    }
  }

  /// Login
  Future<void> login() async {
    // Validation
    if (usernameController.text.isEmpty) {
      Fluttertoast.showToast(
        msg: "Username tidak boleh kosong",
        backgroundColor: Colors.red,
        textColor: Colors.white,
      );
      return;
    }

    try {
      isLoading.value = true;

      final result = await _authRepository.login(
        username: usernameController.text.trim(),
        password: passwordController.text.trim(),
      );

      if (result['status'] == true) {
        final responseData = (result['data'] is Map<String, dynamic>)
            ? result['data'] as Map<String, dynamic>
            : <String, dynamic>{};
        final requiresPasswordChange =
            responseData['requires_password_change'] == true;

        if (requiresPasswordChange) {
          Get.offAllNamed(
            AppRoutes.forcePasswordChange,
            arguments: {
              'username': usernameController.text.trim(),
              'current_password': passwordController.text.trim(),
              'message': result['message']?.toString(),
            },
          );
          return;
        }

        // Success
        Fluttertoast.showToast(
          msg: "Login berhasil!",
          backgroundColor: Colors.green,
          textColor: Colors.white,
        );

        // Navigate to home
        Get.offAllNamed(AppRoutes.home);
      } else {
        _showErrorDialog(result['message']?.toString() ?? 'Login gagal');
      }
    } catch (e) {
      _showErrorDialog(
        ApiErrorHelper.toUserMessage(
          e,
          fallback: 'Login gagal. Silakan coba lagi.',
        ),
      );
    } finally {
      isLoading.value = false;
    }
  }

  void _showErrorDialog(String message) {
    Get.dialog(
      AlertDialog(
        title: const Text('Login Gagal'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Tutup'),
          ),
        ],
      ),
      barrierDismissible: true,
    );
  }

  /// Auto login check
  Future<void> checkAutoLogin() async {
    final isLoggedIn = await _authRepository.isLoggedIn();

    if (isLoggedIn) {
      // Validate token
      final isValid = await _authRepository.validateToken();

      if (isValid) {
        // Token valid, navigate to home
        Get.offAllNamed('/home');
      }
    }
  }
}
