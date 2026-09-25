import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../data/providers/update_provider.dart';
import '../constants/app_colors.dart';

class UpdateDialog extends StatelessWidget {
  final bool forceUpdate;

  const UpdateDialog({
    Key? key,
    this.forceUpdate = false,
  }) : super(key: key);

  static String _formatBytes(int bytes) {
    if (bytes <= 0) return '0 MB';
    final mb = bytes / (1024 * 1024);
    return '${mb.toStringAsFixed(mb >= 100 ? 0 : 1)} MB';
  }

  static List<String> _notes(String raw) {
    return raw
        .split(RegExp(r'[\r\n]+'))
        .map((line) => line.trim().replaceFirst(RegExp(r'^[-•*]+\s*'), ''))
        .where((line) => line.isNotEmpty && line != '-')
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final update = Get.find<UpdateProvider>();

    return Obx(() {
      final phase = update.phase.value;
      final busy = phase == 'downloading' || phase == 'installing';
      final version = update.latestVersion.value;
      final notes = _notes(version?.releaseNotes ?? '');

      return PopScope(
        canPop: !forceUpdate && !busy,
        child: Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: Material(
                color: Colors.white,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _Header(
                      title: forceUpdate
                          ? 'Pembaruan Wajib'
                          : 'Pembaruan Tersedia',
                      subtitle: 'MCS Mobile',
                    ),
                    Flexible(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _VersionRow(
                              current: update.currentVersion.value ?? '-',
                              latest: version?.version ?? '-',
                            ),
                            if (forceUpdate) ...[
                              const SizedBox(height: 12),
                              const _Banner(
                                icon: Icons.priority_high_rounded,
                                color: Color(0xFFB45309),
                                background: Color(0xFFFEF3C7),
                                text:
                                    'Pembaruan ini wajib dipasang agar aplikasi dapat digunakan.',
                              ),
                            ],
                            if (notes.isNotEmpty && phase != 'launched') ...[
                              const SizedBox(height: 16),
                              const Text(
                                'Yang baru',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF111827),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                width: double.infinity,
                                constraints:
                                    const BoxConstraints(maxHeight: 150),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF3F6FB),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: SingleChildScrollView(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      for (final note in notes)
                                        Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 6),
                                          child: Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              const Padding(
                                                padding:
                                                    EdgeInsets.only(top: 2),
                                                child: Icon(
                                                  Icons.check_circle_rounded,
                                                  size: 15,
                                                  color: AppColors.primary,
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  note,
                                                  style: const TextStyle(
                                                    fontSize: 13,
                                                    height: 1.35,
                                                    color: Color(0xFF374151),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                            const SizedBox(height: 18),
                            _buildFooter(update, phase),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  Widget _buildFooter(UpdateProvider update, String phase) {
    switch (phase) {
      case 'downloading':
        final total = update.totalBytes.value;
        final progress = update.downloadProgress.value.clamp(0.0, 1.0);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  total > 0 ? '${(progress * 100).toStringAsFixed(0)}%' : '…',
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 8),
                const Padding(
                  padding: EdgeInsets.only(bottom: 5),
                  child: Text(
                    'Mengunduh pembaruan',
                    style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: total > 0 ? progress : null,
                minHeight: 8,
                backgroundColor: const Color(0xFFE5EAF3),
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              total > 0
                  ? '${_formatBytes(update.downloadedBytes.value)} dari ${_formatBytes(total)}'
                  : _formatBytes(update.downloadedBytes.value),
              style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 12),
            const _Banner(
              icon: Icons.info_outline_rounded,
              color: Color(0xFF1D4ED8),
              background: Color(0xFFEAF2FF),
              text: 'Jangan menutup aplikasi selama proses unduhan berlangsung.',
            ),
          ],
        );
      case 'installing':
        return const Row(
          children: [
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Menyiapkan instalasi…',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        );
      case 'launched':
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Banner(
              icon: Icons.check_circle_rounded,
              color: Color(0xFF15803D),
              background: Color(0xFFDCFCE7),
              text:
                  'Unduhan selesai. Ikuti petunjuk pemasangan yang tampil di layar untuk menyelesaikan pembaruan.',
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: update.downloadAndInstall,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Buka installer lagi'),
              ),
            ),
            if (!forceUpdate) ...[
              const SizedBox(height: 6),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: Get.back,
                  child: const Text('Tutup'),
                ),
              ),
            ],
          ],
        );
      case 'error':
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Banner(
              icon: Icons.error_outline_rounded,
              color: const Color(0xFFB91C1C),
              background: const Color(0xFFFEE2E2),
              text: update.errorMessage.value ?? 'Terjadi kesalahan.',
            ),
            const SizedBox(height: 14),
            _actionRow(update, retry: true),
          ],
        );
      default:
        return _actionRow(update);
    }
  }

  Widget _actionRow(UpdateProvider update, {bool retry = false}) {
    return Row(
      children: [
        if (!forceUpdate) ...[
          Expanded(
            child: OutlinedButton(
              onPressed: Get.back,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Nanti'),
            ),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          flex: 2,
          child: ElevatedButton.icon(
            onPressed: update.downloadAndInstall,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            icon: Icon(
              retry ? Icons.refresh_rounded : Icons.download_rounded,
              size: 18,
            ),
            label: Text(
              retry ? 'Coba Lagi' : 'Perbarui Sekarang',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final String title;
  final String subtitle;

  const _Header({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.system_update_alt_rounded,
              color: AppColors.primary,
              size: 26,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VersionRow extends StatelessWidget {
  final String current;
  final String latest;

  const _VersionRow({required this.current, required this.latest});

  @override
  Widget build(BuildContext context) {
    Widget box(String label, String value, {required bool highlight}) {
      return Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: highlight ? const Color(0xFFEAF2FF) : const Color(0xFFF3F4F6),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: highlight ? AppColors.primary : const Color(0xFFE5E7EB),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
              ),
              const SizedBox(height: 2),
              Text(
                'v$value',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: highlight ? AppColors.primary : const Color(0xFF374151),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Row(
      children: [
        box('Versi saat ini', current, highlight: false),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Icon(
            Icons.arrow_forward_rounded,
            size: 20,
            color: Color(0xFF9CA3AF),
          ),
        ),
        box('Versi terbaru', latest, highlight: true),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color background;
  final String text;

  const _Banner({
    required this.icon,
    required this.color,
    required this.background,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 12.5, height: 1.35, color: color),
            ),
          ),
        ],
      ),
    );
  }
}
