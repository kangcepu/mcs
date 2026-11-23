import 'dart:async';
import 'dart:convert';

import 'package:get/get.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/tablet_nav_data.dart';
import 'tablet_dashboard_page.dart';
import 'tablet_my_work_page.dart';
import 'tablet_work_orders_page.dart';
import 'tablet_asset_manage_page.dart';
import 'tablet_system_settings_page.dart';
import 'tablet_ai_image_analysis_page.dart';
import 'tablet_general_affair_page.dart';
import '../widgets/tablet_submodule_mini_dashboard.dart';
import '../../../data/models/user_model.dart';
import '../../../data/repositories/auth_repository.dart';
import '../../../data/repositories/notification_repository.dart';
import '../../../data/providers/api_service.dart';
import '../../../core/services/connectivity_service.dart';
import '../../../core/services/realtime_service.dart';

/// Shell tablet: sidebar + top bar yang meniru 1:1 `template/sidebar.tsx`
/// dan `template/navbar.tsx` web (warna, struktur, label "Menu Utama",
/// tombol collapse, jam/tanggal, lonceng notifikasi, avatar+nama). Item
/// yang sudah punya layar native (`route` terisi) dibuka dengan
/// `Get.toNamed` sebagai halaman penuh gaya-HP sementara (fallback tahap
/// awal, sesuai rencana porting modul demi modul). Item yang belum
/// di-porting ditampilkan sebagai placeholder di panel konten ini.
class TabletShellPage extends StatefulWidget {
  const TabletShellPage({super.key});

  @override
  State<TabletShellPage> createState() => _TabletShellPageState();
}

// Warna disalin langsung dari token Tailwind yang dipakai sidebar/navbar
// web, supaya tablet terlihat identik dengan web (bukan cuma struktur serupa).
const _kSidebarBg = Color(0xFF0A0F1C); // bg-[#0a0f1c]
const _kActiveBg = Color(0xFF2563EB); // bg-blue-600
const _kHoverBg = Color(0x0DFFFFFF); // bg-white/5
const _kBorder = Color(0x1AFFFFFF); // border-white/10
const _kTextSlate300 = Color(0xFFCBD5E1);
const _kTextSlate400 = Color(0xFF94A3B8);
const _kTextSlate500 = Color(0xFF64748B);
const _kBrand100 = Color(0xFFDCE8FF);
const _kBrand700 = Color(0xFF1D4ED8);

// Di bawah ambang ini web sendiri tidak menampilkan sidebar penuh inline —
// dia jadi overlay (hamburger). Tablet portrait (umumnya ~800-840dp) jatuh
// di bawah ambang ini, jadi harus ikut overlay juga, bukan sidebar desktop
// yang dipepetkan — itu sumber kesan "tetap kayak web" walau sudah portrait.
const double _kDesktopBreakpoint = 1024;
const Duration _kSidebarAnimDuration = Duration(milliseconds: 200);

class _TabletShellPageState extends State<TabletShellPage> {
  String _selectedKey = kTabletDashboardKey;
  String _selectedTitle = 'Dashboard';
  final Set<String> _expanded = {'work_order'};
  // null = belum di-override user, ikut default (expanded di layar desktop).
  bool? _manualCollapsed;
  bool _isDesktopWidth = true;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  User? _user;
  String _appName = 'MCS';
  String _appSubtitle = 'Maintenance Control System';
  String? _logoData;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    User? user;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user_data');
      user = raw == null
          ? null
          : User.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Cache user rusak/tidak tersedia tidak boleh menggagalkan shell.
    }
    if (mounted) setState(() => _user = user);

    try {
      final branding = await ApiService().get('/v2/settings/branding');
      final brandingData = branding.data is Map ? branding.data['data'] : null;
      if (mounted && brandingData is Map) {
        setState(() {
          _appName = '${brandingData['app_name'] ?? 'MCS'}';
          _appSubtitle =
              '${brandingData['app_subtitle'] ?? 'Maintenance Control System'}';
          final logo = '${brandingData['logo_url'] ?? ''}'.trim();
          _logoData = logo.isEmpty ? null : logo;
        });
      }
    } catch (_) {
      // Branding bersifat dekoratif; gunakan identitas bawaan saat offline.
    }
  }

  String get _initials {
    final letters = (_user?.fullname ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .take(3)
        .map((w) => w[0].toUpperCase())
        .join();
    return letters.isEmpty ? '?' : letters;
  }

  void _selectInline(String key, String title) {
    setState(() {
      _selectedKey = key;
      _selectedTitle = title;
      if (key.contains(':')) _expanded.add(key.split(':').first);
    });
    _closeOverlayDrawerIfAny();
  }

  void _openRoute(String key, String title, String route) {
    setState(() {
      _selectedKey = key;
      _selectedTitle = title;
      if (key.contains(':')) _expanded.add(key.split(':').first);
    });
    _closeOverlayDrawerIfAny();
    Get.toNamed(route);
  }

  void _closeOverlayDrawerIfAny() {
    if (!_isDesktopWidth) _scaffoldKey.currentState?.closeDrawer();
  }

  void _confirmLogout() {
    Get.dialog(
      AlertDialog(
        title: const Text('Confirm logout'),
        content: const Text('Are you sure you want to log out?'),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              await AuthRepository().logout();
              Get.offAllNamed('/login');
            },
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      _isDesktopWidth = constraints.maxWidth >= _kDesktopBreakpoint;
      final collapsed = _isDesktopWidth && (_manualCollapsed ?? false);
      return Scaffold(
        key: _scaffoldKey,
        backgroundColor: const Color(0xFFF8FAFC),
        drawer: _isDesktopWidth
            ? null
            : Drawer(
                backgroundColor: _kSidebarBg,
                width: 256,
                child: SafeArea(
                  child: _buildSidebarContent(false, overlay: true),
                ),
              ),
        body: SafeArea(
          child: Row(
            children: [
              if (_isDesktopWidth) _buildSidebar(collapsed),
              Expanded(
                child: Column(
                  children: [
                    _buildTopBar(collapsed),
                    Expanded(child: _buildContent()),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    });
  }

  // --- Top bar: padanan persis template/navbar.tsx ---

  Widget _buildTopBar(bool collapsed) {
    final isDashboard = _selectedKey == kTabletDashboardKey;
    final subtitle = isDashboard ? 'Dashboard' : 'Dashboard → $_selectedTitle';
    final headerWidth = MediaQuery.sizeOf(context).width;
    final showWideHeader = headerWidth >= 1000;
    final showSyncDetails = headerWidth >= 700;
    return Container(
      height: 64,
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0))),
      ),
      child: Row(
        children: [
          _isDesktopWidth
              ? _buildCollapseButton(collapsed)
              : _buildHamburgerButton(),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _selectedTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A)),
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: _kTextSlate400),
                ),
              ],
            ),
          ),
          _DataSyncStatus(showDetails: showSyncDetails),
          if (showWideHeader) const _LiveClock(),
          const _NotifBell(),
          const SizedBox(width: 8),
          _buildAvatarMenu(showName: showWideHeader),
          const SizedBox(width: 16),
        ],
      ),
    );
  }

  Widget _buildHamburgerButton() {
    return IconButton(
      tooltip: 'Open menu',
      icon: const Icon(Icons.menu, size: 22, color: Color(0xFF1E293B)),
      onPressed: () => _scaffoldKey.currentState?.openDrawer(),
    );
  }

  Widget _buildCollapseButton(bool collapsed) {
    return Tooltip(
      message: collapsed ? 'Expand menu' : 'Collapse menu',
      child: GestureDetector(
        onTap: () => setState(() => _manualCollapsed = !collapsed),
        child: Container(
          height: 64,
          width: 40,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF09111F), Color(0xFF070D18)],
            ),
            borderRadius: BorderRadius.horizontal(right: Radius.circular(32)),
          ),
          alignment: Alignment.center,
          child: AnimatedRotation(
            turns: collapsed ? 0.5 : 0,
            duration: const Duration(milliseconds: 200),
            child:
                const Icon(Icons.chevron_left, size: 18, color: Colors.white),
          ),
        ),
      ),
    );
  }

  Widget _buildAvatarMenu({required bool showName}) {
    final name =
        _user?.fullname.isNotEmpty == true ? _user!.fullname : 'Loading…';
    return PopupMenuButton<String>(
      offset: const Offset(0, 44),
      onSelected: (v) {
        if (v == 'logout') _confirmLogout();
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          enabled: false,
          child: SizedBox(
            width: 180,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(name,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1E293B))),
                if (_user?.email.isNotEmpty == true)
                  Text(_user!.email,
                      style:
                          const TextStyle(fontSize: 11, color: _kTextSlate400)),
              ],
            ),
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'logout',
          child: Text('Log out',
              style: TextStyle(fontSize: 13, color: Color(0xFFE11D48))),
        ),
      ],
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 17,
            backgroundColor: _kBrand100,
            child: Text(
              _initials,
              style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w800, color: _kBrand700),
            ),
          ),
          if (showName) ...[
            const SizedBox(width: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 160),
              child: Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF1E293B)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  static const Map<String, String> _kWoChildModule = {
    'MESO': 'meso',
    'Maintenance': 'maintenance',
    'Production': 'production',
    'IS': 'is',
    'GA': 'ga',
  };

  Widget _buildContent() {
    if (_selectedKey == 'my_work') {
      return const TabletMyWorkPage();
    }
    if (_selectedKey == kTabletDashboardKey) {
      return TabletDashboardPage(
        onOpenMyWork: () => _selectInline('my_work', 'My Work'),
      );
    }
    if (_selectedKey == 'work_order' ||
        _selectedKey.startsWith('work_order:')) {
      final childTitle = _selectedKey.startsWith('work_order:')
          ? _selectedKey.substring('work_order:'.length)
          : '';
      return TabletWorkOrdersPage(
        key: ValueKey(_selectedKey),
        initialModule: _kWoChildModule[childTitle] ?? '',
      );
    }
    if (_selectedKey == 'asset_manage') {
      return const TabletAssetManagePage();
    }
    if (_selectedKey == 'master_data:System Settings') {
      return const TabletSystemSettingsPage();
    }
    if (_selectedKey == 'ai_image_analysis') {
      return const TabletAiImageAnalysisPage();
    }
    if (_selectedKey == 'general_affair') {
      return const TabletGeneralAffairPage();
    }
    if (_selectedKey == 'sparepart_management') {
      return const TabletModuleMiniDashboardPage(
          group: 'SPAREPART', title: 'Sparepart Management');
    }
    if (_selectedKey == 'fleet_vehicle') {
      return const TabletModuleMiniDashboardPage(
          group: 'FLEET', title: 'Fleet & Vehicle');
    }
    if (_selectedKey == 'energy_utility') {
      return const TabletModuleMiniDashboardPage(
          group: 'ENERGY', title: 'Energy & Utility');
    }
    if (_selectedKey == 'governance') {
      return const TabletModuleMiniDashboardPage(
          group: 'GOVERNANCE', title: 'Governance');
    }
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.hourglass_top_outlined,
              size: 40, color: Color(0xFFCBD5E1)),
          const SizedBox(height: 12),
          Text(
            '$_selectedTitle is not available on tablet yet.',
            style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 4),
          const Text(
            'This module will be added in a future release.',
            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
        ],
      ),
    );
  }

  // --- Sidebar: padanan persis template/sidebar.tsx ---

  Widget _buildSidebar(bool collapsed) {
    return AnimatedContainer(
      duration: _kSidebarAnimDuration,
      width: collapsed ? 64 : 256, // w-64 / lg:w-16
      color: _kSidebarBg,
      child: _buildSidebarContent(collapsed),
    );
  }

  // Dipakai baik sebagai sidebar inline (desktop/landscape lebar) maupun
  // sebagai isi Drawer overlay (tablet portrait / layar < 1024dp, sama
  // seperti web sendiri tidak menaruh sidebar penuh di lebar segitu).
  Widget _buildSidebarContent(bool collapsed, {bool overlay = false}) {
    final visibleSections = tabletNavSections
        .map((section) =>
            MapEntry(section, section.items.where(_isNavItemVisible).toList()))
        .where((entry) => entry.value.isNotEmpty)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildBrandHeader(collapsed, overlay: overlay),
        Container(
          margin: EdgeInsets.symmetric(horizontal: collapsed ? 12 : 20),
          height: 1,
          color: _kBorder,
        ),
        if (collapsed) const SizedBox(height: 12),
        Expanded(
          child: ListView(
            padding: EdgeInsets.symmetric(
                horizontal: collapsed ? 8 : 12, vertical: 0),
            children: [
              for (var i = 0; i < visibleSections.length; i++) ...[
                if (!collapsed)
                  Padding(
                    padding: EdgeInsets.fromLTRB(8, i == 0 ? 8 : 18, 8, 8),
                    child: Text(
                      visibleSections[i].key.title.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                        letterSpacing: 1.2,
                      ),
                    ),
                  )
                else if (i > 0)
                  const SizedBox(height: 10),
                ...visibleSections[i]
                    .value
                    .map((item) => _buildNavItem(item, collapsed)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _buildBrandHeader(bool collapsed, {bool overlay = false}) {
    return Padding(
      padding:
          EdgeInsets.fromLTRB(collapsed ? 12 : 20, 20, collapsed ? 12 : 20, 16),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _kBorder),
            ),
            alignment: Alignment.center,
            child: _buildBrandLogo(),
          ),
          // AnimatedCrossFade (bukan `if` yang langsung lenyap) supaya label
          // ikut fade+resize selaras dengan animasi lebar AnimatedContainer
          // sidebar — itu sumber kesan "ga smooth" saat collapse sebelumnya.
          AnimatedCrossFade(
            duration: _kSidebarAnimDuration,
            crossFadeState: collapsed
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            firstChild: Padding(
              padding: const EdgeInsets.only(left: 12),
              child: SizedBox(
                width: overlay ? 124 : 164,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_appName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white)),
                    const SizedBox(height: 2),
                    Text(
                      _appSubtitle,
                      style:
                          const TextStyle(fontSize: 10.5, color: Colors.white),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
            secondChild: const SizedBox(width: 0),
          ),
          if (overlay)
            IconButton(
              tooltip: 'Close menu',
              onPressed: () => _scaffoldKey.currentState?.closeDrawer(),
              icon: const Icon(Icons.close, size: 20, color: _kTextSlate300),
              constraints: const BoxConstraints.tightFor(width: 40, height: 40),
              padding: EdgeInsets.zero,
            ),
        ],
      ),
    );
  }

  Widget _buildBrandLogo() {
    final source = _logoData;
    if (source != null && source.startsWith('data:') && source.contains(',')) {
      try {
        return Image.memory(
            base64Decode(source.substring(source.indexOf(',') + 1)),
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) =>
                const Icon(Icons.build, size: 20, color: Color(0xFF0A0F1C)));
      } catch (_) {
        // Fallback ke asset lokal.
      }
    }
    return Image.asset('assets/logo.png',
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) =>
            const Icon(Icons.build, size: 20, color: Color(0xFF0A0F1C)));
  }

  bool _hasAnyPermission(List<String> required) {
    if (required.isEmpty) return true;
    if ((_user?.username ?? '').toUpperCase() == 'SUPERUSER') return true;
    if (_user?.permissions?.hasAny(const ['*', 'super_admin']) == true) {
      return true;
    }
    return _user?.permissions?.hasAny(required) ?? false;
  }

  List<TabletNavChild> _visibleChildren(TabletNavItem item) =>
      (item.children ?? const <TabletNavChild>[])
          .where((child) => _hasAnyPermission(child.permissions))
          .toList();

  bool _isNavItemVisible(TabletNavItem item) {
    final children = item.children ?? const <TabletNavChild>[];
    if (children.isNotEmpty &&
        children.any((child) => child.permissions.isNotEmpty)) {
      return _visibleChildren(item).isNotEmpty;
    }
    return _hasAnyPermission(item.permissions);
  }

  Widget _buildNavItem(TabletNavItem item, bool collapsed) {
    final children = _visibleChildren(item);
    final hasChildren = children.isNotEmpty;
    final isActive =
        _selectedKey == item.key || _selectedKey.startsWith('${item.key}:');
    final expanded = _expanded.contains(item.key);

    final navigationItem = Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: isActive ? _kActiveBg : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              hoverColor: _kHoverBg,
              splashColor: _kHoverBg,
              onTap: () {
                if (collapsed && hasChildren) {
                  setState(() {
                    _manualCollapsed = false;
                    _expanded.add(item.key);
                  });
                  return;
                }
                if (hasChildren) {
                  if (item.route != null) {
                    _openRoute(item.key, item.title, item.route!);
                  } else {
                    _selectInline(item.key, item.title);
                  }
                } else if (item.route != null) {
                  _openRoute(item.key, item.title, item.route!);
                } else {
                  _selectInline(item.key, item.title);
                }
              },
              child: AnimatedPadding(
                duration: _kSidebarAnimDuration,
                padding: EdgeInsets.symmetric(
                    horizontal: collapsed ? 0 : 12, vertical: 11),
                child: AnimatedAlign(
                  duration: _kSidebarAnimDuration,
                  alignment:
                      collapsed ? Alignment.center : Alignment.centerLeft,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(item.icon,
                          size: 18,
                          color: isActive ? Colors.white : _kTextSlate300),
                      // AnimatedCrossFade (bukan `if` yang lenyap instan)
                      // supaya label+posisi icon ikut meluncur selaras
                      // dengan animasi lebar sidebar, tidak "patah".
                      AnimatedCrossFade(
                        duration: _kSidebarAnimDuration,
                        crossFadeState: collapsed
                            ? CrossFadeState.showSecond
                            : CrossFadeState.showFirst,
                        firstChild: Padding(
                          padding: const EdgeInsets.only(left: 12),
                          child: SizedBox(
                            width: 150,
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    item.title,
                                    style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w500,
                                        color: Colors.white),
                                  ),
                                ),
                                if (item.comingSoon)
                                  Container(
                                    margin: const EdgeInsets.only(left: 6),
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color:
                                          Colors.white.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: const Text(
                                      'SOON',
                                      style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: Colors.white,
                                          letterSpacing: .3),
                                    ),
                                  ),
                                if (hasChildren)
                                  InkResponse(
                                    radius: 22,
                                    onTap: () => setState(() {
                                      if (expanded) {
                                        _expanded.remove(item.key);
                                      } else {
                                        _expanded.add(item.key);
                                      }
                                    }),
                                    child: SizedBox(
                                      width: 40,
                                      height: 40,
                                      child: AnimatedRotation(
                                        turns: expanded ? 0.5 : 0,
                                        duration:
                                            const Duration(milliseconds: 150),
                                        child: const Icon(
                                            Icons.keyboard_arrow_down,
                                            size: 18,
                                            color: _kTextSlate500),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        secondChild: const SizedBox(width: 0),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (!collapsed && hasChildren && expanded)
            Padding(
              padding: const EdgeInsets.only(left: 13, top: 4),
              child: Container(
                padding: const EdgeInsets.only(left: 12),
                decoration: const BoxDecoration(
                  border: Border(left: BorderSide(color: _kBorder)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: children
                      .map((child) => _buildNavChild(item.key, child))
                      .toList(),
                ),
              ),
            ),
        ],
      ),
    );
    if (!collapsed) return navigationItem;
    return Tooltip(
      message: item.title,
      waitDuration: const Duration(milliseconds: 350),
      child: navigationItem,
    );
  }

  Widget _buildNavChild(String parentKey, TabletNavChild child) {
    final childKey = '$parentKey:${child.title}';
    final childSelected = _selectedKey == childKey;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        hoverColor: _kHoverBg,
        onTap: () {
          if (child.route != null) {
            _openRoute(childKey, child.title, child.route!);
          } else {
            _selectInline(childKey, child.title);
          }
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(
            children: [
              Icon(child.icon, size: 14, color: Colors.white),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  child.title,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight:
                        childSelected ? FontWeight.w700 : FontWeight.w400,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Jam berjalan terisolasi di widget-nya sendiri — tick tiap 30s hanya
/// me-rebuild dirinya sendiri, bukan seluruh shell (sidebar 13 item +
/// konten dashboard), itu sumber "ga smooth" sebelumnya.
class _LiveClock extends StatefulWidget {
  const _LiveClock();

  @override
  State<_LiveClock> createState() => _LiveClockState();
}

class _LiveClockState extends State<_LiveClock> {
  String _time = '';
  String _date = '';
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _tick() {
    final now = DateTime.now();
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ];
    if (!mounted) return;
    setState(() {
      _time =
          '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
      _date =
          '${now.day.toString().padLeft(2, '0')} ${months[now.month - 1]} ${now.year}';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 16),
      padding: const EdgeInsets.only(right: 16),
      decoration: const BoxDecoration(
        border: Border(right: BorderSide(color: Color(0xFFE2E8F0))),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.access_time, size: 16, color: _kTextSlate400),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                _time.isEmpty ? '--:--' : _time,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E293B)),
              ),
              Text(
                _date.isEmpty ? '-- --- ----' : _date,
                style: const TextStyle(fontSize: 10, color: _kTextSlate400),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DataSyncStatus extends StatelessWidget {
  final bool showDetails;

  const _DataSyncStatus({required this.showDetails});

  String _formatTimestamp(DateTime? value) {
    if (value == null) return 'Waiting for data';
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${value.day.toString().padLeft(2, '0')} '
        '${months[value.month - 1]} ${value.year}, '
        '${value.hour.toString().padLeft(2, '0')}:'
        '${value.minute.toString().padLeft(2, '0')}:'
        '${value.second.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final connectivity = Get.find<ConnectivityService>();
    final realtime = Get.find<RealtimeService>();
    return Obx(() {
      final online = connectivity.isOnline.value;
      final connected = realtime.connected.value;
      return ValueListenableBuilder<int>(
        valueListenable: ApiService.activeRequests,
        builder: (context, activeRequests, _) {
          return ValueListenableBuilder<DateTime?>(
            valueListenable: ApiService.lastSuccessfulSync,
            builder: (context, lastSync, _) {
              final busy = activeRequests > 0;
              final status = !online
                  ? 'Offline'
                  : busy
                      ? 'Syncing'
                      : connected
                          ? 'Real-Time'
                          : 'Reconnecting';
              final healthy = online && connected;
              final timestamp = _formatTimestamp(lastSync);
              final accent =
                  healthy ? const Color(0xFF059669) : const Color(0xFFD97706);
              final accentSurface =
                  healthy ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB);
              final label = 'Data: $status. Last sync: $timestamp';

              return Tooltip(
                message: label,
                child: Semantics(
                  label: label,
                  child: Container(
                    height: 44,
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 7),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: accent.withValues(alpha: .24)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: accentSurface,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: busy
                              ? Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: accent,
                                  ),
                                )
                              : Icon(
                                  online ? Icons.wifi : Icons.wifi_off,
                                  size: 19,
                                  color: accent,
                                ),
                        ),
                        if (showDetails) ...[
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 174,
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 8,
                                      height: 8,
                                      decoration: BoxDecoration(
                                        color: accent,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Data: $status',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w700,
                                        color: accent,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Last Sync: $timestamp',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 9.5,
                                    color: Color(0xFF64748B),
                                    fontFeatures: [
                                      FontFeature.tabularFigures(),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      );
    });
  }
}

/// Lonceng notifikasi terisolasi juga — polling 45s hanya me-rebuild badge
/// ini sendiri, tidak memicu rebuild sidebar/konten di sekitarnya.
class _NotifBell extends StatefulWidget {
  const _NotifBell();

  @override
  State<_NotifBell> createState() => _NotifBellState();
}

class _NotifBellState extends State<_NotifBell> {
  int _count = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 45), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await NotificationRepository().getNotificationSummary();
      if (result.status && result.data != null && mounted) {
        setState(() => _count = result.data!.totalNotifications);
      }
    } catch (_) {
      // Non-fatal — badge cukup tidak tampil kalau gagal memuat.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_outlined,
              size: 22, color: Color(0xFF64748B)),
          onPressed: () {},
        ),
        if (_count > 0)
          Positioned(
            right: 4,
            top: 4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16),
              decoration: BoxDecoration(
                  color: const Color(0xFFF43F5E),
                  borderRadius: BorderRadius.circular(999)),
              alignment: Alignment.center,
              child: Text(
                _count > 99 ? '99+' : '$_count',
                style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: Colors.white),
              ),
            ),
          ),
      ],
    );
  }
}
