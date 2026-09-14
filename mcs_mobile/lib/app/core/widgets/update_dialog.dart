import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../data/providers/update_provider.dart';

class UpdateDialog extends StatelessWidget {
  final bool forceUpdate;

  const UpdateDialog({
    Key? key,
    this.forceUpdate = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final updateProvider = Get.find<UpdateProvider>();
    
    return PopScope(
      canPop: !forceUpdate,
      child: AlertDialog(
        title: const Text('Update Tersedia'),
        content: Obx(() {
          final latestVersion = updateProvider.latestVersion.value;
          
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Versi terbaru: ${latestVersion?.version ?? '-'}'),
              Text('Versi saat ini: ${updateProvider.currentVersion.value ?? '-'}'),
              const SizedBox(height: 16),
              if (latestVersion?.releaseNotes != null) ...[
                const Text(
                  'Yang baru:',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(latestVersion!.releaseNotes),
              ],
              const SizedBox(height: 16),
              if (updateProvider.isDownloading.value)
                Column(
                  children: [
                    LinearProgressIndicator(
                      value: updateProvider.downloadProgress.value,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${(updateProvider.downloadProgress.value * 100).toStringAsFixed(0)}%',
                    ),
                  ],
                ),
            ],
          );
        }),
        actions: [
          Obx(() {
            return Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!forceUpdate && !updateProvider.isDownloading.value)
                  TextButton(
                    onPressed: () => Get.back(),
                    child: const Text('Nanti'),
                  ),
                if (!updateProvider.isDownloading.value)
                  const SizedBox(width: 8),
                if (!updateProvider.isDownloading.value)
                  ElevatedButton(
                    onPressed: () => updateProvider.downloadAndInstall(),
                    child: const Text('Update Sekarang'),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }
}