import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../services/connectivity_service.dart';

/// Wraps the whole app (see `main.dart`'s `GetMaterialApp.builder`) so a
/// single "Tidak ada koneksi internet" strip shows above every page the
/// moment the backend becomes unreachable, instead of each screen handling
/// connectivity on its own with scattered per-call error snackbars.
class ConnectivityBanner extends StatelessWidget {
  final Widget child;

  const ConnectivityBanner({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final connectivity = Get.find<ConnectivityService>();

    return Column(
      children: [
        Obx(() {
          if (connectivity.isOnline.value) return const SizedBox.shrink();
          return GestureDetector(
            onTap: connectivity.checkNow,
            child: Material(
              color: const Color(0xFFDC2626),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: const [
                      Icon(Icons.cloud_off_rounded,
                          size: 15, color: Colors.white),
                      SizedBox(width: 6),
                      Text(
                        'Tidak ada koneksi internet — ketuk untuk cek ulang',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }),
        Expanded(child: child),
      ],
    );
  }
}
