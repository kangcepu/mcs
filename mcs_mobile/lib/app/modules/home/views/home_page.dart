import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/widgets/mini_charts.dart';
import '../controllers/home_controller.dart';
import 'profile_page.dart';

int _asInt(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse('$v') ?? 0;
}

double? _asDoubleN(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse('$v');
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  DateTime _now = DateTime.now();
  Timer? _clockTimer;

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      setState(() {
        _now = DateTime.now();
      });
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(HomeController());

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Color(0xFF070D1A),
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FB),
        // Ringkasan + kartu analisa tingginya tetap (konten pendek, gak
        // perlu scroll buat baca), grid Menu ambil SISA ruang layar lewat
        // Expanded+LayoutBuilder — jadi semua tile tetap kelihatan tanpa
        // scroll, labelnya juga dibuat gede & tebal sesuai sisa ruang itu.
        body: Column(
          children: [
            _buildHeaderCard(controller, context),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSummarySection(controller),
                    const SizedBox(height: 8),
                    _buildAnalysisSection(controller),
                    const SizedBox(height: 8),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        'Menu',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF111827),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Expanded(child: _buildMenuSection(context, controller)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderCard(HomeController controller, BuildContext context) {
    final timeLabel = DateFormat('HH:mm').format(_now);
    final dateLabel = formatDisplayDateValue(_now);
    final topInset = MediaQuery.of(context).padding.top;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16, topInset + 10, 16, 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF070D1A), Color(0xFF0A1222)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF070D1A).withOpacity(0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Image.asset('assets/logo.png', fit: BoxFit.contain),
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                timeLabel,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                dateLabel,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.92),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(width: 8),
          Stack(
            children: [
              Material(
                color: Colors.white.withOpacity(0.18),
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () async {
                    await controller.notificationController.loadNotifications();
                    controller.notificationController.markAsRead();
                    controller.notificationController
                        .showNotificationBottomSheet();
                  },
                  child: const SizedBox(
                    width: 42,
                    height: 42,
                    child: Icon(
                      Icons.notifications_none_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                ),
              ),
              Obx(() {
                final count =
                    controller.notificationController.totalNotificationCount;
                if (count <= 0) return const SizedBox.shrink();
                final badgeText = count > 99 ? '99+' : '$count';
                return Positioned(
                  top: 4,
                  right: 4,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 18),
                    height: 18,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Colors.white, width: 1.6),
                    ),
                    child: Center(
                      child: Text(
                        badgeText,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.white.withOpacity(0.18),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () {
                Get.to(() => const ProfilePage());
              },
              child: const SizedBox(
                width: 42,
                height: 42,
                child: Icon(
                  Icons.account_circle_outlined,
                  color: Colors.white,
                  size: 22,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummarySection(HomeController controller) {
    return Row(
      children: [
        Expanded(
          child: Obx(
            () => _buildSummaryCard(
              value: controller.preventiveWoCount.value,
              label: 'PREV',
              color: const Color(0xFF16A34A),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Obx(
            () => _buildSummaryCard(
              value: controller.correctiveWoCount.value,
              label: 'COR',
              color: const Color(0xFF2563EB),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Obx(
            () => _buildSummaryCard(
              value: controller.projectWoCount.value,
              label: 'PRO',
              color: const Color(0xFF4B5563),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Obx(
            () => _buildSummaryCard(
              value: controller.getModuleCount('/approval'),
              label: 'Approval',
              color: const Color(0xFF7C3AED),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard({
    required int value,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value > 999 ? '999+' : '$value',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Color(0xFF6B7280),
            ),
          ),
        ],
      ),
    );
  }

  /// Kartu ringkasan analisa — padanan ringkas dashboard web (rasio
  /// preventive, WO overdue, komposisi status, tren, umur WO) supaya
  /// bisa analisa cepat tanpa buka daftar WO satu-satu.
  Widget _buildAnalysisSection(HomeController controller) {
    return Obx(() {
      final data = controller.dashboardSummary.value;
      if (data == null) {
        if (!controller.isLoadingDashboard.value) return const SizedBox.shrink();
        return Container(
          height: 64,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          alignment: Alignment.center,
          child: const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        );
      }

      final totals = Map<String, dynamic>.from(data['totals'] as Map? ?? {});
      final byType = Map<String, dynamic>.from(data['by_type'] as Map? ?? {});
      final agingList = (data['aging'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      final trendList = (data['trend'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      final open = _asInt(totals['open']);
      final inProgress = _asInt(totals['in_progress']);
      final overdue = agingList.length >= 4
          ? _asInt(agingList[2]['count']) + _asInt(agingList[3]['count'])
          : 0;
      final ratio = _asDoubleN(byType['preventive_ratio']);
      final fromLabel = '${data['from'] ?? ''}';
      final toLabel = '${data['to'] ?? ''}';

      return Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _analysisStat(
                  'Rasio PM',
                  ratio == null ? '-' : '${ratio.toStringAsFixed(0)}%',
                  const Color(0xFF16A34A),
                ),
                const SizedBox(width: 14),
                _analysisStat('WO Overdue', '$overdue', const Color(0xFFE11D48)),
                const SizedBox(width: 14),
                _analysisStat('Berjalan', '${open + inProgress}', const Color(0xFF7C3AED)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Tren Work Order',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
                ),
                if (fromLabel.isNotEmpty)
                  Text(
                    '$fromLabel – $toLabel',
                    style: const TextStyle(fontSize: 8.5, color: Color(0xFF94A3B8)),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            TrendChartFull(
              height: 68,
              data: trendList
                  .map((t) => TrendPoint(
                        '${t['date']}',
                        _asDoubleN(t['created']) ?? 0,
                        _asDoubleN(t['closed']) ?? 0,
                        _asDoubleN(t['closed_corrective']) ?? 0,
                      ))
                  .toList(),
            ),
          ],
        ),
      );
    });
  }

  static Widget _analysisStat(String label, String value, Color color) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
        const SizedBox(width: 3),
        Text(label, style: const TextStyle(fontSize: 8.5, color: Color(0xFF64748B))),
      ],
    );
  }

  /// Grid menu — isi persis sisa ruang (Expanded dari pemanggil) lewat
  /// LayoutBuilder, biar semua tile tetap kelihatan tanpa scroll. Ukuran
  /// label/ikon ikut discale dari tinggi sel yang kebagian, bukan dipatok
  /// kecil terus — biar judul menu tetap kebaca gede & tebal.
  Widget _buildMenuSection(BuildContext context, HomeController controller) {
    final items = controller.visibleMenuItems;
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;
    final crossAxisCount = isTablet ? 5 : 4;
    const spacing = 8.0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final rows = (items.length / crossAxisCount).ceil();
        final cellWidth =
            (constraints.maxWidth - spacing * (crossAxisCount - 1)) / crossAxisCount;
        final cellHeight = (constraints.maxHeight - spacing * (rows - 1)) / rows;
        final aspectRatio = (cellWidth / cellHeight).clamp(0.55, 1.4);

        return GridView.builder(
          itemCount: items.length,
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            crossAxisSpacing: spacing,
            mainAxisSpacing: spacing,
            childAspectRatio: aspectRatio,
          ),
          itemBuilder: (context, index) {
            return _buildModuleCard(items[index], controller, cellHeight: cellHeight);
          },
        );
      },
    );
  }

  Widget _buildModuleCard(
    MenuItem item,
    HomeController controller, {
    required double cellHeight,
  }) {
    // Skala kontinu dari tinggi sel aktual — labelnya selalu dibuat
    // sebesar & setebal mungkin yang masih muat, bukan dipatok ke satu
    // ukuran kecil tetap.
    final labelFontSize = (cellHeight * 0.115).clamp(10.0, 13.5);
    final labelBoxHeight = (cellHeight * 0.28).clamp(18.0, 30.0);
    final visualSize = (cellHeight * 0.42).clamp(26.0, 42.0);
    final countFontSize = (cellHeight * 0.32).clamp(18.0, 30.0);
    const cardRadius = BorderRadius.all(Radius.circular(18));
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: Colors.white,
          borderRadius: cardRadius,
          child: InkWell(
            borderRadius: cardRadius,
            onTap:
                item.enabled ? () => controller.navigateToModule(item) : null,
            child: Ink(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: cardRadius,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.045),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: cardRadius,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Container(
                        width: double.infinity,
                        margin: EdgeInsets.zero,
                        decoration: BoxDecoration(
                          color: item.color
                              .withOpacity(item.enabled ? 0.14 : 0.08),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(18),
                          ),
                        ),
                        child: controller.shouldShowModuleCount(item.route)
                            ? Obx(() {
                                final count =
                                    controller.getModuleCount(item.route);
                                return Center(
                                  child: Text(
                                    '$count',
                                    textAlign: TextAlign.center,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: item.enabled
                                          ? item.color
                                          : const Color(0xFF9CA3AF),
                                      fontSize: count > 9999 ? countFontSize * 0.75 : countFontSize,
                                      fontWeight: FontWeight.w800,
                                      height: 1,
                                    ),
                                  ),
                                );
                              })
                            : Center(
                                child: _buildMenuVisual(
                                  item,
                                  controller,
                                  size: visualSize,
                                ),
                              ),
                      ),
                    ),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(4, 4, 4, 6),
                      color: Colors.white,
                      child: SizedBox(
                        height: labelBoxHeight,
                        child: Center(
                          child: Text(
                            _formatMenuTitle(item.title),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: labelFontSize,
                              height: 1.1,
                              fontWeight: FontWeight.w800,
                              color: item.enabled
                                  ? const Color(0xFF1F2937)
                                  : const Color(0xFF9CA3AF),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (item.route == '/daily_control')
          Obx(() {
            final count = controller.dailyControlUnreadCount.value;
            if (count <= 0) {
              return const SizedBox.shrink();
            }

            final badgeText = count > 99 ? '99+' : '$count';
            return Positioned(
              top: -4,
              right: -4,
              child: Container(
                constraints: const BoxConstraints(minWidth: 22),
                height: 22,
                padding: const EdgeInsets.symmetric(horizontal: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: Center(
                  child: Text(
                    badgeText,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }

  Widget _buildMenuVisual(
    MenuItem item,
    HomeController controller, {
    required double size,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: item.color.withOpacity(item.enabled ? 0.14 : 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        item.icon ?? Icons.apps_rounded,
        color: item.enabled ? item.color : const Color(0xFF9CA3AF),
        size: size * 0.48,
      ),
    );
  }

  String _formatMenuTitle(String title) {
    switch (title) {
      case 'Daily Control':
        return 'Daily\nControl';
      case 'WO Produksi':
        return 'WO\nProduksi';
      case 'Stock Opname':
        return 'Stock\nOpname';
      case 'Asset Mutation':
        return 'Asset\nMutation';
      case 'Scan QR Asset':
        return 'Scan QR\nAsset';
      default:
        return title;
    }
  }

}
