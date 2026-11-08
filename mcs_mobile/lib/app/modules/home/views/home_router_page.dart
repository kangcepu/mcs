import 'package:flutter/material.dart';
import '../../../core/utils/device_type.dart';
import '../../home_tablet/views/tablet_shell_page.dart';
import 'home_page.dart';

/// Satu titik percabangan UI phone vs tablet, dipasang di route `/home`
/// supaya seluruh call site (`Get.offAllNamed(AppRoutes.home)`) tidak perlu
/// diubah. UI phone (`HomePage`) sama sekali tidak disentuh.
class HomeRouterPage extends StatelessWidget {
  const HomeRouterPage({super.key});

  @override
  Widget build(BuildContext context) {
    if (isTabletLayout(context)) {
      return const TabletShellPage();
    }
    return const HomePage();
  }
}
