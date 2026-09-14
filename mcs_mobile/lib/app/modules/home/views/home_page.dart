import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/app_date_format_helper.dart';
import '../controllers/home_controller.dart';
import 'profile_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final ScrollController _scrollController = ScrollController();
  final GlobalKey _menuKey = GlobalKey();
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
    _scrollController.dispose();
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
        body: Column(
          children: [
            _buildHeaderCard(controller, context),
            Expanded(
              child: SingleChildScrollView(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSummarySection(controller),
                    const SizedBox(height: 1),
                    _buildMenuSection(context, controller),
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value > 999 ? '999+' : '$value',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF6B7280),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuSection(BuildContext context, HomeController controller) {
    final items = controller.visibleMenuItems;
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;
    final crossAxisCount = isTablet ? 5 : 4;

    return Column(
      key: _menuKey,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Menu',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Color(0xFF111827),
            ),
          ),
        ),
        GridView.builder(
          itemCount: items.length,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 12),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 0.92,
          ),
          itemBuilder: (context, index) {
            return _buildModuleCard(items[index], controller);
          },
        ),
      ],
    );
  }

  Widget _buildModuleCard(MenuItem item, HomeController controller) {
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
                                      fontSize: count > 9999 ? 24 : 30,
                                      fontWeight: FontWeight.w800,
                                      height: 1,
                                    ),
                                  ),
                                );
                              })
                            : Center(child: _buildMenuVisual(item, controller)),
                      ),
                    ),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(6, 6, 6, 8),
                      color: Colors.white,
                      child: SizedBox(
                        height: 22,
                        child: Center(
                          child: Text(
                            _formatMenuTitle(item.title),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: item.title.length >= 13 ? 10 : 11,
                              height: 1.1,
                              fontWeight: FontWeight.w700,
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

  Widget _buildMenuVisual(MenuItem item, HomeController controller) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: item.color.withOpacity(item.enabled ? 0.14 : 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        item.icon ?? Icons.apps_rounded,
        color: item.enabled ? item.color : const Color(0xFF9CA3AF),
        size: 18,
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

  void _scrollToTop() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOut,
    );
  }

  void _scrollToMenu() {
    final context = _menuKey.currentContext;
    if (context == null) return;

    Scrollable.ensureVisible(
      context,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOut,
      alignment: 0.08,
    );
  }
}
